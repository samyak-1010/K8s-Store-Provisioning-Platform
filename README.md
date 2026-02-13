# K8s Store Provisioning Platform

A production-grade, Kubernetes-native platform to provision WooCommerce stores on demand.

## 🚀 Features
- **One-click Provisioning**: Deploys WordPress + WooCommerce + MySQL in isolated namespaces.
- **Helm-based Architecture**: Uses standard Helm charts for reproducible deployments.
- **K8s Native**: Leverages Namespaces, Quotas, NetworkPolicies, and Secrets.
- **Observability**: Real-time status updates and logging.

## 🛠 Prerequisites
- Docker
- Kubernetes Cluster (Kind) `kind create cluster`
- Helm
- Node.js (for local dev)

## 📦 Architecture
- **Dashboard**: React UI for managing stores.
- **Platform API**: Node.js backend & Orchestrator.
- **Helm Charts**:
  - `charts/platform`: Deploys the Dashboard and API.
  - `charts/store-woocommerce`: The template for tenant stores.

## 🏃 Quick Start (Local)

1. **Start Cluster & Ingress**
   ```bash
   kind create cluster --config kind-config.yaml # (Optional custom config)
   # Install Nginx Ingress
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
   ```

2. **Build Images**
   ```bash
   docker build -t platform-backend:latest ./backend
   docker build -t platform-dashboard:latest ./dashboard
   kind load docker-image platform-backend:latest
   kind load docker-image platform-dashboard:latest
   ```

3. **Deploy Platform**
   ```bash
   helm install platform ./helm/platform -f ./helm/values-local.yaml
   ```

4. **Access Dashboard**
   - Open http://platform.localtest.me

5. **Create a Store**
   - Click "Create Store".
   - Watch it provision.
   - Access at `http://<store-name>.localtest.me`.

## 🧪 Testing
Run `npm test` in backend/frontend directories.
