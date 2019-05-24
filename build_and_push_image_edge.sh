set -exo pipefail
yarn
yarn build
image=netless-react-whiteboard
version=1.0.0

hash=$(git rev-parse --short HEAD)

docker build -f Dockerfile -t registry.cn-hangzhou.aliyuncs.com/white/$image:$version-$hash -t registry.cn-hangzhou.aliyuncs.com/white/$image:latest .
docker push registry.cn-hangzhou.aliyuncs.com/white/$image:$version-$hash
docker push registry.cn-hangzhou.aliyuncs.com/white/$image:latest

ssh app@k8s-cloud -tt "cd /home/app/k8s-stack/demo/netless-react-whiteborad && \
    kubectl apply -f deploy.yml && \
    kubectl patch deployment netless-react-whiteborad -n demo --patch '{\"spec\": {\"template\": {\"metadata\": {\"annotations\": {\"version\": \"$version-$hash\"}}}}}'"