#!/usr/bin/env bash
# Өдөр тутмын медиа sync (T-91, AC-204): SeaweedFS bucket → Oracle Object Storage эсвэл хавтас.
#
#   <dest>/media/current           — bucket-ийн толь (rclone sync)
#   <dest>/media/deleted/<огноо>/  — тэр өдөр bucket-аас устсан/солигдсон объект (--backup-dir)
#   deleted/ дотор BACKUP_RETENTION_DAYS (30)-аас хуучин объектыг устгана — хэрэглэгч устгасан
#   медиа 30 хоногийн дараа backup-аас ч алга болно (INV-16, docs/BACKUP.md §6).
#
# dest = BACKUP_REMOTE (жишээ `oracle:aura-backup`), хоосон бол BACKUP_DIR (контейнерт /backups).
# Хэрэглээ:  deploy/backup/media-sync.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

bucket="${AURA_S3_BUCKET:-$(env_get AURA_S3_BUCKET)}"; bucket="${bucket:-aura-media}"
dest="${BACKUP_REMOTE:-/backups}"
day=$(date -u +%F)

trap 'echo "$(date -u +%FT%TZ) media-sync амжилтгүй" >> "$BACKUP_DIR/status/media-sync.failed"; log "АЛДАА: media-sync" >&2' ERR

log "медиа sync: seaweed:$bucket → $dest/media/current"
rclone_run sync "seaweed:$bucket" "$dest/media/current" \
  --backup-dir "$dest/media/deleted/$day" --fast-list --transfers 4 --checkers 8 --stats-one-line --stats 0 --log-level NOTICE
# Хадгалах хугацааг хавтасны огноогоор (объектын modtime нь эх файлынх тул --min-age тохирохгүй)
cutoff=$(date -u -d "-${BACKUP_RETENTION_DAYS} days" +%F)
for d in $(rclone_run lsf --dirs-only "$dest/media/deleted" 2>/dev/null | tr -d '\r/'); do
  if [[ "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [[ "$d" < "$cutoff" ]]; then
    rclone_run purge "$dest/media/deleted/$d" --log-level NOTICE && log "  устгав: media/deleted/$d"
  fi
done

summary=$(rclone_run size "$dest/media/current" 2>/dev/null | tr '\n' ' ' || true)
echo "$(date -u +%Y%m%dT%H%M%SZ) $summary" > "$BACKUP_DIR/status/media-sync.ok"
log "медиа sync амжилттай: $summary"
