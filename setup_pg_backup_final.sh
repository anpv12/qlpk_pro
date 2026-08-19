#!/bin/bash
set -e

################################################################################
# QLPK PostgreSQL Backup to Google Drive
# Tự động backup database lên Google Drive
################################################################################

# ==================== CẤU HÌNH ====================

# Docker container
CONTAINER_NAME="qlpk_postgres"
DB_NAME="qlpk_db"
DB_USER="postgres"

# Local
BACKUP_SCRIPT="/opt/backup_postgres_gdrive.sh"
LOCAL_TMP="/opt/pg_backup_tmp"
LOG_FILE="/var/log/pg_backup.log"

# Google Drive
GDRIVE_REMOTE="gdrive"  # Tên remote đã config trong rclone
GDRIVE_FOLDER="QLPK_Backups"  # Thư mục trên Google Drive

# Cron: 02:00 mỗi ngày
CRON_TIME="0 2 * * *"

# Retention
RETENTION_DAYS=30

# ==================== SETUP ====================

echo "========================================="
echo "QLPK Backup to Google Drive Setup"
echo "========================================="

# 1. Kiểm tra rclone
echo "Bước 1: Kiểm tra rclone..."
if ! command -v rclone > /dev/null 2>&1; then
  echo "❌ Rclone chưa được cài đặt!"
  echo ""
  echo "Cài đặt rclone:"
  echo "  curl https://rclone.org/install.sh | sudo bash"
  echo ""
  echo "Sau đó cấu hình Google Drive:"
  echo "  rclone config"
  exit 1
fi

# 2. Kiểm tra remote gdrive
echo "Bước 2: Kiểm tra remote 'gdrive'..."
if ! rclone listremotes | grep -q "^${GDRIVE_REMOTE}:$"; then
  echo "❌ Remote '${GDRIVE_REMOTE}' chưa được cấu hình!"
  echo ""
  echo "Cấu hình Google Drive:"
  echo "  rclone config"
  echo "  - Tên remote: ${GDRIVE_REMOTE}"
  echo "  - Type: drive"
  exit 1
fi

# 3. Tạo thư mục local
mkdir -p "$LOCAL_TMP"

# 4. Tạo backup script
echo "Bước 3: Tạo backup script..."
cat > "$BACKUP_SCRIPT" << 'SCRIPT_EOF'
#!/bin/bash
set -e

# Config
CONTAINER_NAME="qlpk_postgres"
DB_NAME="qlpk_db"
DB_USER="postgres"
LOCAL_TMP="/opt/pg_backup_tmp"
GDRIVE_REMOTE="gdrive"
GDRIVE_FOLDER="QLPK_Backups"
LOG_FILE="/var/log/pg_backup.log"
RETENTION_DAYS=30

# Generate filename
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="qlpk_backup_${DATE}.sql"

# Log start
echo "[$(date)] START BACKUP" >> "$LOG_FILE"

# Create local backup dir
mkdir -p "$LOCAL_TMP"

# Kiểm tra container đang chạy
echo "[$(date)] Checking container status..." >> "$LOG_FILE"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "[$(date)] ERROR: Container '$CONTAINER_NAME' is not running!" >> "$LOG_FILE"
    exit 1
fi

# Dump database với các flags tối ưu cho restore
# --clean: Xóa objects cũ trước khi restore
# --if-exists: Không báo lỗi nếu object không tồn tại
# --create: Bao gồm lệnh CREATE DATABASE
# Loại bỏ dòng \restrict để tương thích SQL client GUI
echo "[$(date)] Dumping database..." >> "$LOG_FILE"
if docker exec "$CONTAINER_NAME" pg_dump \
    -U "$DB_USER" \
    --clean \
    --if-exists \
    --create \
    --encoding=UTF8 \
    "$DB_NAME" | grep -v "^\\\\restrict" > "$LOCAL_TMP/$BACKUP_FILE"; then
    SIZE=$(du -h "$LOCAL_TMP/$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Dump success: $SIZE" >> "$LOG_FILE"
else
    echo "[$(date)] ERROR: Dump failed!" >> "$LOG_FILE"
    exit 1
fi

# Upload to Google Drive
echo "[$(date)] Uploading to Google Drive..." >> "$LOG_FILE"
if rclone copy "$LOCAL_TMP/$BACKUP_FILE" "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}" --progress 2>&1 | tee -a "$LOG_FILE"; then
    echo "[$(date)] Upload success" >> "$LOG_FILE"
else
    echo "[$(date)] ERROR: Upload failed!" >> "$LOG_FILE"
    exit 1
fi

# Clean old backups on Google Drive
echo "[$(date)] Cleaning old backups..." >> "$LOG_FILE"
rclone delete "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}" --min-age "${RETENTION_DAYS}d" 2>&1 | tee -a "$LOG_FILE"

# Clean local backup
rm -f "$LOCAL_TMP/$BACKUP_FILE"

echo "[$(date)] BACKUP SUCCESS: $BACKUP_FILE" >> "$LOG_FILE"
SCRIPT_EOF

chmod +x "$BACKUP_SCRIPT"

# 5. Tạo cronjob
echo "Bước 4: Tạo cronjob..."
(crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT"; \
 echo "$CRON_TIME $BACKUP_SCRIPT") | crontab -

# 6. Test backup
echo "Bước 5: Test backup..."
"$BACKUP_SCRIPT"

echo ""
echo "========================================="
echo "✓ SETUP HOÀN TẤT"
echo "========================================="
echo "Google Drive   : ${GDRIVE_REMOTE}:${GDRIVE_FOLDER}"
echo "Backup Script  : ${BACKUP_SCRIPT}"
echo "Cron Schedule  : ${CRON_TIME} (2:00 AM daily)"
echo "Log File       : ${LOG_FILE}"
echo "Retention      : ${RETENTION_DAYS} days"
echo "Format         : .sql (plain SQL)"
echo "========================================="
echo ""
echo "📋 HƯỚNG DẪN SỬ DỤNG:"
echo ""
echo "1. Kiểm tra log:"
echo "   tail -f ${LOG_FILE}"
echo ""
echo "2. Chạy backup thủ công:"
echo "   ${BACKUP_SCRIPT}"
echo ""
echo "3. Xem backup trên Google Drive:"
echo "   rclone ls ${GDRIVE_REMOTE}:${GDRIVE_FOLDER}"
echo ""
echo "4. Tải backup về:"
echo "   rclone copy ${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/qlpk_backup_YYYYMMDD_HHMMSS.sql /tmp/"
echo ""
echo "5. RESTORE DATABASE:"
echo "   # Cách 1: Restore vào database hiện tại (ghi đè)"
echo "   docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} < /tmp/qlpk_backup_*.sql"
echo ""
echo "   # Cách 2: Restore vào database mới"
echo "   docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} postgres < /tmp/qlpk_backup_*.sql"
echo ""
echo "   # Cách 3: Restore với log chi tiết"
echo "   docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -v ON_ERROR_STOP=1 < /tmp/qlpk_backup_*.sql"
echo ""
echo "========================================="
