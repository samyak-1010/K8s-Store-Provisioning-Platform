const k8s = require('@kubernetes/client-node');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

// K8s Client Setup
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const networkingApi = kc.makeApiClient(k8s.NetworkingV1Api);

const HELM_CHART_PATH = process.env.HELM_CHART_PATH || '../helm/store-woocommerce';

async function provisionStore(store, db) {
    console.log(`[${store.id}] Starting provisioning for ${store.name}...`);
    const namespace = `store-${store.id}`;
    const releaseName = `store-${store.id}`;

    try {
        // 1. Create Namespace
        console.log(`[${store.id}] Creating Namespace...`);
        await createNamespace(namespace);

        // 2. Create Quotas, Limits & Network Policies (Best Practice)
        console.log(`[${store.id}] Applying Resource Constraints & Security...`);
        await createQuota(namespace);
        await createLimitRange(namespace);
        await createNetworkPolicy(namespace);

        // 3. Helm Install
        console.log(`[${store.id}] Running Helm Install...`);
        // Note: We use the store ID in the host to ensure uniqueness
        const host = `${store.name}.localtest.me`; // Local dev domain

        // Construct Helm command
        // In production, charts would be pulled from a repo. Here we use local path.
        // We assume the backend container has access to the helm charts (mounted or copied)
        const cmd = `helm upgrade --install ${releaseName} ${HELM_CHART_PATH} --namespace ${namespace} --set ingress.host=${host} --set wordpress.title="${store.name}" --wait --timeout 5m`;

        console.log(`[${store.id}] Executing: ${cmd}`);
        await execPromise(cmd);

        // 4. Update Status
        console.log(`[${store.id}] Provisioning Success!`);
        const stmt = db.prepare('UPDATE stores SET status = ?, url = ? WHERE id = ?');
        stmt.run('READY', `http://${host}`, store.id);

    } catch (err) {
        console.error(`[${store.id}] Provisioning Failed:`, err);
        console.error(err.stdout); // Log helm output if any
        console.error(err.stderr);
        const stmt = db.prepare('UPDATE stores SET status = ? WHERE id = ?');
        stmt.run('FAILED', store.id);
    }
}

async function deleteStore(store, db) {
    console.log(`[${store.id}] Starting deletion...`);
    const namespace = `store-${store.id}`;
    const releaseName = `store-${store.id}`;

    try {
        // 1. Helm Uninstall
        console.log(`[${store.id}] Helm Uninstall...`);
        try {
            await execPromise(`helm uninstall ${releaseName} --namespace ${namespace}`);
        } catch (e) {
            console.warn(`[${store.id}] Helm uninstall warning (might not exist): ${e.message}`);
        }

        // 2. Delete Namespace (Cleans up PVCs, Secrets, etc. if owned by NS)
        console.log(`[${store.id}] Deleting Namespace...`);
        try {
            await k8sApi.deleteNamespace(namespace);
        } catch (e) {
            console.warn(`[${store.id}] Namespace delete warning: ${e.message}`);
        }

        // 3. Update DB
        const stmt = db.prepare('DELETE FROM stores WHERE id = ?');
        stmt.run(store.id);
        console.log(`[${store.id}] Deletion Complete.`);

    } catch (err) {
        console.error(`[${store.id}] Deletion Failed:`, err);
        // Mark as FAILED_DELETE or similar if you want to keep it, but usually we just force clean
    }
}

// Helpers
async function createNamespace(name) {
    try {
        await k8sApi.createNamespace({
            metadata: { name }
        });
    } catch (err) {
        if (err.response && err.response.statusCode === 409) {
            console.log(`Namespace ${name} already exists.`);
        } else {
            throw err;
        }
    }
}

async function createQuota(namespace) {
    const quota = {
        metadata: { name: 'store-quota' },
        spec: {
            hard: {
                'pods': '10',
                'requests.cpu': '1',
                'requests.memory': '1Gi',
                'limits.cpu': '2',
                'limits.memory': '2Gi'
            }
        }
    };
    try {
        await k8sApi.createNamespacedResourceQuota(namespace, quota);
    } catch (err) {
        if (err.response && err.response.statusCode !== 409) throw err;
    }
}

async function createLimitRange(namespace) {
    const limitRange = {
        metadata: { name: 'store-limit-range' },
        spec: {
            limits: [{
                type: 'Container',
                default: {
                    cpu: '250m',
                    memory: '256Mi'
                },
                defaultRequest: {
                    cpu: '100m',
                    memory: '128Mi'
                }
            }]
        }
    };
    try {
        await k8sApi.createNamespacedLimitRange(namespace, limitRange);
    } catch (err) {
        if (err.response && err.response.statusCode !== 409) throw err;
    }
}

async function createNetworkPolicy(namespace) {
    const netpol = {
        metadata: { name: 'default-deny-external' },
        spec: {
            podSelector: {}, // Select all pods
            policyTypes: ['Ingress'],
            ingress: [
                {
                    // Allow Ingress Controller (This relies on Ingress Controller having specific labels or namespace, 
                    // simpler here is to allow from all namespaces if we don't know ingress details, 
                    // OR allow all internal traffic within cluster but that defeats the purpose.
                    // For "Deny All + Allow Ingress", we typically allow traffic from the ingress-controller namespace.
                    // IMPORTANT: Getting this right on Kind vs Prod varies. 
                    // Safest for interview demo: Allow from all (since Ingress is external) 
                    // BUT restrict port 80/443 or specific app ports?
                    // Actually, "allow ingress" usually means allow traffic that Matches an Ingress resource.
                    // But NetPol doesn't parse Ingress resources.
                    // We will allow traffic from ANYWHERE to Port 80 (WordPress) for now, 
                    // but Block traffic to DB (MySQL) from outside the namespace.

                    // Lets refine: Deny All Default.
                    // Allow: Same Namespace.
                    // Allow: Ingress Controller (hard to predict NS). 
                    // Compromise for simple demo: Allow all ingress to port 80. Deny defaults protected DB.
                },
                {
                    from: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": namespace } } }]
                }
            ]
        }
    };

    // Better Approach for "Deny All + Allow Ingress":
    // 1. Deny All (Ingress)
    // 2. Allow Ingress via "Ingress Controller" logic is complex without knowing Ingress NS.
    // We will implement a relaxed policy that is explainable:
    // Allow ALL traffic to port 80 (HTTP). 
    // Deny everything else (Protects DB port 3306 from external).

    const allowWeb = {
        metadata: { name: 'allow-web-ingress' },
        spec: {
            podSelector: { matchLabels: { app: 'wordpress' } }, // Target WP only
            policyTypes: ['Ingress'],
            ingress: [{}] // Allow all sources (Ingress Controller)
        }
    };

    const denyAll = {
        metadata: { name: 'deny-all' },
        spec: {
            podSelector: {},
            policyTypes: ['Ingress'],
            ingress: [] // Empty = Deny All
        }
    };

    const allowAllocated = {
        metadata: { name: 'allow-internal-db' },
        spec: {
            podSelector: { matchLabels: { app: 'mysql' } },
            policyTypes: ['Ingress'],
            ingress: [{
                from: [{ podSelector: { matchLabels: { app: 'wordpress' } } }]
            }]
        }
    }

    try {
        await networkingApi.createNamespacedNetworkPolicy(namespace, denyAll);
        // We need to define labels dynamically or rely on chart labels.
        // Chart uses: app: {{ .Release.Name }}-wordpress
        // The release name is passed as store-id. 
        // We will construct the policies dynamically based on our known chart labels.

        const releaseName = `store-${namespace.replace('store-', '')}`;

        allowWeb.spec.podSelector.matchLabels = { app: `${releaseName}-wordpress` };
        allowAllocated.spec.podSelector.matchLabels = { app: `${releaseName}-mysql` };
        allowAllocated.spec.ingress[0].from[0].podSelector.matchLabels = { app: `${releaseName}-wordpress` };

        await networkingApi.createNamespacedNetworkPolicy(namespace, allowWeb);
        await networkingApi.createNamespacedNetworkPolicy(namespace, allowAllocated);

    } catch (err) {
        if (err.response && err.response.statusCode !== 409) {
            console.warn("NetPol creation warning:", err.message);
        }
    }
}

module.exports = { provisionStore, deleteStore };
