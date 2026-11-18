# Build a Postgres image that runs nuq.sql during initdb
# Uses the forked Alpine-based postgres from poslogica/postgres

ARG PG_BASE=basewarden-postgres:local
FROM ${PG_BASE}

# Switch to root for package installs, then back to postgres (uid 70)
USER root:root

# Build pg_cron from source against PG17 in the base image.
# The Alpine 3.24 repos ship pg_cron compiled for PG18, which is
# ABI-incompatible with the PG17 in the forked base image.
# We skip the LLVM bitcode install because the base image's PG was
# built with LLVM21 but Alpine 3.24 ships LLVM22 (incompatible paths).
RUN set -eux; \
    apk add --no-cache git build-base postgresql-dev; \
    rm -rf /var/cache/apk/*; \
    # PGXS hardcodes clang-21/llvm21 but Alpine 3.24 ships clang-22/llvm22.
    # Symlink clang-21 so LLVM bytecode compilation works during make.
    if [ ! -f /usr/bin/clang-21 ] && [ -f /usr/bin/clang-22 ]; then \
        ln -sf clang-22 /usr/bin/clang-21; \
    fi; \
    git clone --depth 1 https://github.com/citusdata/pg_cron.git /tmp/pg_cron; \
    cd /tmp/pg_cron; \
    make -j$(nproc); \
    # Manually install only the essential extension files (skip LLVM bitcode which needs llvm21)
    /usr/bin/install -c -m 755 pg_cron.so /usr/local/lib/postgresql/pg_cron.so; \
    /usr/bin/install -c -m 644 pg_cron.control /usr/local/share/postgresql/extension/; \
    /usr/bin/install -c -m 644 pg_cron--1.0--1.1.sql pg_cron--1.1--1.2.sql \
      pg_cron--1.2--1.3.sql pg_cron--1.3--1.4.sql pg_cron--1.4--1.4-1.sql \
      pg_cron--1.4-1--1.5.sql pg_cron--1.5--1.6.sql pg_cron--1.0.sql \
      /usr/local/share/postgresql/extension/; \
    cd /; \
    rm -rf /tmp/pg_cron; \
    apk del --no-cache git build-base

# Ensure pg_cron is preloaded on first startup by modifying the initdb template
RUN set -eux; \
    conf_sample="/usr/local/share/postgresql/postgresql.conf.sample"; \
    if [ -f "$conf_sample" ]; then \
        sed -ri "s/^#?shared_preload_libraries\s*=.*/shared_preload_libraries = 'pg_cron'/" "$conf_sample"; \
        printf "\n# Added for pg_cron\ncron.database_name = 'postgres'\n" >> "$conf_sample"; \
    fi

# Copy nuq.sql so it is executed as part of the initdb sequence
COPY nuq.sql /docker-entrypoint-initdb.d/010-nuq.sql

# Restore the postgres user
USER 70:70