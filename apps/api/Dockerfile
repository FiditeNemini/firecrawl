# syntax=docker/dockerfile:1
# Debian 13 (trixie) base, digest-pinned: fewer and newer OS packages than bookworm.
FROM node:22-trixie-slim@sha256:b26b04c123d9ff8ab646ceb18b9d75a1173acf64b9a401094b906d27b29338d4 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV CI=true

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

# Build Go shared library
FROM golang:1.27-trixie@sha256:433790e515d27dc6003e847e644cc0af956985cf315c1c58a3b73ee2dd305183 AS go-build
WORKDIR /app
COPY sharedLibs/go-html-to-md ./sharedLibs/go-html-to-md

RUN cd sharedLibs/go-html-to-md && \
    go mod download && \
    go build -o libhtml-to-markdown.so -buildmode=c-shared html-to-markdown.go

FROM base AS build
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# FoundationDB client library (libfdb_c + headers), needed by the
# `foundationdb` npm package at install time on arches without prebuilds
ARG FDB_VERSION=7.3.63
RUN ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in arm64) FDB_ARCH=aarch64 ;; *) FDB_ARCH=$ARCH ;; esac && \
    curl -fsSL -o /tmp/fdb-clients.deb \
      "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_${FDB_ARCH}.deb" && \
    dpkg -i /tmp/fdb-clients.deb && rm /tmp/fdb-clients.deb

# Install Rust
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path \
    && chmod -R a+w $RUSTUP_HOME $CARGO_HOME

# Copy dependency inputs. The native workspace is included here because its
# install script builds the Rust package; API TypeScript source is copied after
# dependency install so source-only changes do not invalidate this layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches ./patches
COPY native ./native

# Install dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/native/target \
    pnpm install --frozen-lockfile

COPY . .

# Build the application from a clean output directory.
RUN rm -rf dist && pnpm run build
ARG GIT_SHA=unknown
RUN test -s dist/src/harness.js && \
    test -s dist/src/controllers/v0/crawl-status.js && \
    printf '%s\n' "$GIT_SHA" > BUILD_SHA

# Remove dev dependencies
RUN pnpm prune --prod --ignore-scripts

# FoundationDB client library, extracted in a build-only stage. Its dpkg
# records travel with the files so image inventories (SBOMs, scanners) stay accurate.
FROM base AS fdb
ARG FDB_VERSION=7.3.63
RUN apt-get update && apt-get install -y curl && \
    ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in arm64) FDB_ARCH=aarch64 ;; *) FDB_ARCH=$ARCH ;; esac && \
    curl -fsSL -o /tmp/fdb-clients.deb \
      "https://github.com/apple/foundationdb/releases/download/${FDB_VERSION}/foundationdb-clients_${FDB_VERSION}-1_${FDB_ARCH}.deb" && \
    dpkg -i /tmp/fdb-clients.deb && \
    mkdir -p /out/lib /out/status.d && \
    cp /usr/lib/libfdb_c.so /out/lib/ && \
    cp -P /usr/lib/*-linux-gnu/liblzma.so.5* /out/lib/ && \
    dpkg-query -s foundationdb-clients > /out/status.d/foundationdb-clients && \
    dpkg-query -s liblzma5 > /out/status.d/liblzma5 && \
    printf '%s\n' 'PRETTY_NAME="Debian GNU/Linux 13 (trixie) (distroless)"' 'NAME="Debian GNU/Linux"' 'ID=debian' 'VERSION_ID="13"' 'VERSION="13 (trixie)"' 'VERSION_CODENAME=trixie' 'HOME_URL="https://github.com/GoogleContainerTools/distroless"' > /out/os-release

# Runtime stage: distroless Node (no shell, package manager or userland tools).
# Minions runs `node dist/src/index.js`; the harness entrypoint needs Docker and
# is not supported in this image.
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:5ef534d3db0ac0c43bee379af4ae49cfbfc0ef38a46c94c52d87c68f32f34d8a AS runtime

EXPOSE 8080
WORKDIR /app
ARG GIT_SHA=unknown
ENV FIRECRAWL_BUILD_SHA=$GIT_SHA

COPY --from=fdb /out/lib/ /usr/lib/
COPY --from=fdb /out/status.d/ /var/lib/dpkg/status.d/
# Distroless's os-release omits VERSION_CODENAME and names itself "Distroless", which
# stops scanners from matching Debian advisories (a false "0 CVEs"). This is the
# accurate identification of the trixie packages the image contains.
COPY --from=fdb /out/os-release /etc/os-release
COPY --from=fdb /out/os-release /usr/lib/os-release

# Copy built application
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/dist ./dist
COPY --from=build --chown=65532:65532 /app/native ./native
COPY --from=build --chown=65532:65532 /app/BUILD_SHA ./BUILD_SHA
COPY --from=build --chown=65532:65532 /app/openapi.json ./openapi.json
COPY --from=build --chown=65532:65532 /app/openapi-v0.json ./openapi-v0.json

# Copy Go shared library
COPY --from=go-build --chown=65532:65532 /app/sharedLibs/go-html-to-md/libhtml-to-markdown.so ./sharedLibs/go-html-to-md/

RUN ["/nodejs/bin/node", "-e", "const fs = require('fs'); for (const p of ['dist/src/index.js', 'dist/src/controllers/v0/crawl-status.js', 'BUILD_SHA']) { if (!fs.statSync(p).size) throw new Error(p + ' missing or empty'); }"]

USER 65532:65532

ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist/src/index.js"]
