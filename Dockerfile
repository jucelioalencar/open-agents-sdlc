FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    WORKSPACE_DIR=/workspace \
    CODEX_HOME=/run/codex \
    DISABLE_AUTOUPDATER=1 \
    OPENCODE_DISABLE_AUTOUPDATE=1 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    NUGET_XMLDOC_MODE=skip

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git bash ca-certificates curl gnupg python3 python3-pip python3-venv rustc cargo php-cli perl gcc g++ make golang-go default-jdk ruby \
    && curl -fsSL https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -o /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends dotnet-sdk-9.0 dotnet-sdk-10.0 \
    && rm -rf /var/lib/apt/lists/* /tmp/packages-microsoft-prod.deb \
    && npm install --global --no-audit --no-fund @openai/codex @anthropic-ai/claude-code opencode-ai

ARG TARGETARCH=amd64
RUN set -eu; \
    case "$TARGETARCH" in amd64|arm64) kubectl_arch="$TARGETARCH" ;; *) echo "Unsupported kubectl architecture: $TARGETARCH" >&2; exit 1 ;; esac; \
    kubectl_version="$(curl -fsSL https://dl.k8s.io/release/stable.txt)"; \
    mkdir -p /tmp/kubectl-download; cd /tmp/kubectl-download; \
    curl -fsSLO "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${kubectl_arch}/kubectl"; \
    curl -fsSLO "https://dl.k8s.io/release/${kubectl_version}/bin/linux/${kubectl_arch}/kubectl.sha256"; \
    echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check; \
    install -m 0755 kubectl /usr/local/bin/kubectl; \
    rm -rf /tmp/kubectl-download

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts
COPY server ./server
COPY index.html ./index.html
COPY src ./src
COPY entrypoint.sh ./entrypoint.sh

RUN mkdir -p /data /workspace /run/codex && chown -R node:node /app /data /workspace /run/codex && chmod +x /app/entrypoint.sh
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server/server.js"]
