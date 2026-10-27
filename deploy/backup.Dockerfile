FROM restic/restic:0.18.1 AS restic
FROM postgres:18.4-bookworm
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY backup.sh /usr/local/bin/backup
ENTRYPOINT ["sh", "/usr/local/bin/backup"]
