# Backup and restore

ANOR keeps its state in two places:

1. **PostgreSQL.** Everything: users, shops, products, orders, payments, wallets, chats, the audit
   log, and pg-boss job queues (schema `pgboss`).
2. **Uploaded files.** Product photos, avatars, chat attachments, KYC documents and return photos.
   They live in Supabase Storage (`STORAGE_DRIVER=supabase`) or under `STORAGE_LOCAL_DIR`
   (`storage/uploads`, or the `uploads` volume in Docker).

A restore needs both, taken at roughly the same time. Database rows point at file keys, so a
database restored without its files shows broken images, and orphaned files are harmless.

Secrets (`.env`, Vercel env, `SESSION_SECRET`) are not part of a backup. Keep them in a password
manager or a secrets store.

> **Keep `SESSION_SECRET` with your backups.** It derives the keys that encrypt webhook signing
> secrets, TOTP seeds and other values at rest. A database restored under a different secret
> logs everyone out, and those encrypted values can no longer be decrypted: sellers then have to
> rotate webhook secrets, and staff have to set up TOTP again.

## Targets

| | Recommended |
|---|---|
| RPO (data you can lose) | ≤ 5 minutes with Supabase PITR; ≤ 24 hours with nightly dumps only |
| RTO (time to restore) | < 1 hour for a database below 10 GB |
| Retention | 7 daily, 4 weekly and 12 monthly copies; keep at least one copy off-site |
| Restore drill | monthly, into a scratch database (see the last section) |

Keep backups for at least as long as the data retention rules in **Admin → Settings** and the
privacy policy require, and no longer. Erased accounts must stay erased after a restore (see the
last restore step).

## Supabase (production)

- **Daily backups.** Paid plans include daily backups (*Database → Backups*), and restore is
  one click in the dashboard. This restores the whole project database in place.
- **Point-in-time recovery (PITR).** This is an add-on; enable it for production. It restores to
  any second in the retention window, which is the fastest way back from a bad migration or a
  mass deletion. In the dashboard, open *Database → Backups → Point in time*, pick a timestamp
  just before the incident, and confirm. The project is unavailable while it restores.
- **Your own logical dumps.** Take these as well, so that a copy exists outside Supabase and
  you can restore into any Postgres:

  ```bash
  # DIRECT_URL = the direct/session connection (port 5432), not the pooler
  pg_dump "$DIRECT_URL" --format=custom --no-owner --no-privileges \
    --exclude-schema=pgboss --file "anor-$(date -u +%Y%m%dT%H%MZ).dump"
  ```

  Use `pg_dump` with the same major version as the server (Supabase shows it under *Database →
  Settings*). Encrypt the file before it leaves the machine, for example
  `age -r <recipient> file.dump > file.dump.age` or `gpg --symmetric`, and upload it to storage
  in another account or region.
- **Storage.** Supabase backups do **not** include Storage objects. Copy the bucket, for example
  through Supabase's S3-compatible endpoint with `rclone`:

  ```bash
  # rclone remote "supa" = S3 provider, endpoint https://<project>.supabase.co/storage/v1/s3,
  # access keys from Project settings → Storage → S3 access keys
  rclone sync supa:anor  backup:anor-files/current \
    --backup-dir backup:anor-files/$(date -u +%Y%m%d)
  ```

## Docker Compose / self-hosted

Database, a nightly cron on the host:

```bash
docker compose exec -T postgres pg_dump -U anor -d anor --format=custom --exclude-schema=pgboss \
  > /var/backups/anor/db-$(date -u +%Y%m%d).dump
```

Uploaded files (the `uploads` volume):

```bash
docker run --rm -v anor_uploads:/data:ro -v /var/backups/anor:/backup alpine \
  tar czf /backup/uploads-$(date -u +%Y%m%d).tgz -C /data .
```

For continuous archiving (PITR) on your own Postgres, use pgBackRest or WAL-G with an object store.
Both work with the `postgres:16` image.

## Restore

1. **Stop writes.** In **Admin → Settings**, pause new orders (checkout pauses, browsing
   continues), or scale the app and worker to zero.
2. **Restore the database** into an empty database:

   ```bash
   createdb -h <host> -U <user> anor_restore
   pg_restore --no-owner --no-privileges --jobs 4 -d "postgresql://<user>:<password>@<host>:5432/anor_restore" anor-YYYYMMDD.dump
   ```

   With Docker:
   ```bash
   docker compose exec -T postgres createdb -U anor anor_restore
   docker compose exec -T postgres pg_restore -U anor -d anor_restore --no-owner < db-YYYYMMDD.dump
   ```
3. **Bring the schema up to date.** Point `DIRECT_URL` at the restored database and run
   `npx prisma migrate deploy`. The dump carries its `_prisma_migrations` table, so only newer
   migrations are applied. The pg-boss schema was excluded from the dump; the worker recreates it
   on start, and scheduled jobs come back from code.
4. **Restore files.** Run `rclone sync` in the other direction, or untar into the `uploads`
   volume.
5. **Switch over.**
   - Point `DATABASE_URL`/`DIRECT_URL` at the restored database (or rename it to `anor`).
   - Make sure the original `SESSION_SECRET` is set.
   - Start the app and worker.
   - Check `/health` and **Admin → Status**.
6. **Clean up after the restore.**
   - Run the `retention.purge` job (Admin → Status → Run now) to drop data that expired
     while the backup sat in storage.
   - Accounts erased after the backup was taken come back with the restore. Re-apply those
     erasures from the incident-time audit log, or from support records if that log is lost.
   - Payments confirmed by a provider after the backup must be reconciled against the
     provider's records. The mock gateway has none.
   - Everyone signed in after the backup has to sign in again.
   - Tell staff the restore time, so they can redo moderation and support work done since then.

## Restore drill (monthly)

```bash
pg_restore --list anor-latest.dump > /dev/null            # the file is readable
createdb anor_drill && pg_restore --no-owner -d anor_drill anor-latest.dump
DATABASE_URL=postgresql://…/anor_drill DIRECT_URL=postgresql://…/anor_drill npx prisma migrate status
psql -d anor_drill -c 'select count(*) from "User"; select max("createdAt") from "Order";'
dropdb anor_drill
```

Record the date, dump size, restore duration and the newest order timestamp. The gap between that
timestamp and the backup time is your real RPO.
