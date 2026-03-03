# DBA Backup Platform

A comprehensive database backup monitoring and analytics platform that collects backup metrics from multiple database types (SQL Server, Oracle, MySQL) and provides a real-time dashboard with analytics, alerts, and reporting capabilities.

## 🏗️ Architecture Overview

The platform consists of 4 main services running in Docker containers:

1. **backup-collector** - Data collection service (Node.js + Python hybrid)
2. **dashboard** - Web analytics dashboard (Node.js/Express + HTML/CSS/JS)
3. **supabase-db** - PostgreSQL database with analytics views (PostgreSQL 15)
4. **pgadmin** - Database administration interface (pgAdmin4)

## 🛠️ Tech Stack

### Backend Services
- **Node.js** - Primary runtime for collectors and dashboard
- **Python** - Secondary collector implementation
- **Express.js** - Web framework for dashboard API
- **PostgreSQL 15** - Primary database with pgcrypto extension
- **Docker & Docker Compose** - Containerization and orchestration

### Database Connectors
- **mssql** (v12.2.0) - SQL Server connectivity
- **oracledb** (v6.10.0) - Oracle Database connectivity  
- **mysql2** (v3.18.2) - MySQL/MariaDB connectivity
- **pg** (v8.19.0) - PostgreSQL connectivity

### Frontend
- **Vanilla JavaScript** - Dashboard frontend
- **Chart.js** (v4.4.2) - Data visualization and charts
- **HTML5/CSS3** - Responsive UI with dark theme

### Scheduling & Automation
- **node-cron** (v4.2.1) - Scheduled data collection (hourly)

### Security
- **pgcrypto** - AES-256 encryption for database credentials
- **dotenv** - Environment variable management

## 📋 Services Description

### 1. Backup Collector Service
**Location**: `backup-collector/`
**Purpose**: Connects to monitored databases and collects backup history data

**Key Features**:
- Scheduled collection every hour via cron
- Multi-database support (SQL Server, Oracle, MySQL)  
- Encrypted credential storage
- Automatic server discovery from environment variables
- Error handling and logging

**Main Files**:
- [`src/index.js`](backup-collector/src/index.js) - Main orchestrator with cron scheduling
- [`src/db.js`](backup-collector/src/db.js) - Database utilities and schema management
- [`src/collectors/sqlserver.js`](backup-collector/src/collectors/sqlserver.js) - SQL Server backup data collector
- [`src/collectors/oracle.js`](backup-collector/src/collectors/oracle.js) - Oracle RMAN backup collector  
- [`src/collectors/mysql.js`](backup-collector/src/collectors/mysql.js) - MySQL backup log collector
- [`collector.py`](backup-collector/collector.py) - Python-based collector (alternative implementation)

### 2. Dashboard Service  
**Location**: `dashboard/`
**Purpose**: Web interface for analytics, server management, and monitoring

**Key Features**:
- Real-time backup analytics dashboard
- Server registration and management
- Alert monitoring and reporting
- RESTful API for data access
- Responsive web interface

**Main Files**:
- [`server.js`](dashboard/server.js) - Express.js API server with all endpoints
- [`public/index.html`](dashboard/public/index.html) - Single-page dashboard application

### 3. Database Service (Supabase-DB)
**Purpose**: PostgreSQL instance with backup analytics schema

**Key Features**:
- Encrypted credential storage using pgcrypto
- Pre-built analytics views for reporting
- Automated alert generation
- Backup metrics storage and aggregation

### 4. pgAdmin Service
**Purpose**: Database administration interface
**Access**: http://localhost:5050
- **Username**: admin@admin.com  
- **Password**: admin

## 🔌 API Endpoints

### Server Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List all monitored servers (passwords excluded) |
| POST | `/api/servers` | Add new monitored server with encrypted password |
| PATCH | `/api/servers/:id` | Update server configuration |
| DELETE | `/api/servers/:id` | Remove monitored server |

### Analytics & Reporting
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/summary` | KPI summary (databases monitored, success rate, failures) |
| GET | `/api/success-rate` | Success rate by database type (last 30 days) |
| GET | `/api/duration` | Average backup duration by database/server |
| GET | `/api/size-per-day` | Backup size trends per day (last 30 days) |
| GET | `/api/rpo-status` | RPO status and hours since last backup |
| GET | `/api/monthly-trend` | Monthly backup growth trends |
| GET | `/api/recent` | Last 100 backup jobs |

### Alerts & Monitoring  
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | Active unresolved alerts (limit 50) |
| POST | `/api/refresh-alerts` | Trigger alert refresh and generation |

## 🗄️ Database Schema

### Core Tables
- **`monitored_servers`** - Registered database servers with encrypted credentials
- **`backup_metrics`** - Collected backup job data and metrics  
- **`backup_alerts`** - Generated alerts for failures, RPO violations, etc.
- **`collector_logs`** - Service logs and events

### Analytics Views
- **`vw_backup_success_rate`** - Success percentage by database type
- **`vw_avg_backup_duration`** - Average backup times by server/database
- **`vw_backup_size_per_day`** - Daily backup size aggregations
- **`vw_rpo_status`** - RPO compliance and last backup times
- **`vw_monthly_backup_trend`** - Monthly trends and growth patterns

### Key Functions
- **`refresh_backup_alerts()`** - Generates alerts for failures, RPO violations, and size spikes

## ⚙️ Configuration

### Environment Variables (.env)

#### Database Connection
```env
SUPABASE_HOST=supabase-db
SUPABASE_USER=postgres  
SUPABASE_PASSWORD=postgres
SUPABASE_DB=postgres
```

#### Security
```env
# AES-256 master key for password encryption
MASTER_KEY=ChangeMeAny3Saa123$$
```

#### SQL Server Configuration
```env
SQLSERVER_USER=sa
SQLSERVER_PASSWORD="password10$"
SQLSERVER_HOST=10.236.9.69
SQLSERVER_PORT=1433
```

#### Oracle Configuration  
```env
ORACLE_USER=sys
ORACLE_PASSWORD="Ghana10$"
# TNS Description format for connection
ORACLE_CONNECT_STRING=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=10.236.199.27)(PORT=1521))(CONNECT_DATA=(SID=IHDB)))
```

#### MySQL Configuration
```env
MYSQL_HOST=10.236.210.160
MYSQL_PORT=3306
MYSQL_USER=DBA
MYSQL_PASSWORD="Password123$"
MYSQL_DB=backup_monitor
```

## 🚀 Deployment & Operations

### Prerequisites
- Docker & Docker Compose
- Network access to monitored database servers
- Sufficient disk space for PostgreSQL data

### Initial Setup
```bash
# 1. Clone and navigate to project
cd dba-backup-platform

# 2. Configure environment variables
cp backup-collector/.env.example backup-collector/.env
# Edit .env with your database credentials

# 3. Start all services
docker-compose up -d

# 4. Verify services are running
docker-compose ps
```

### Service Ports
- **Dashboard**: http://localhost:3000
- **PostgreSQL**: localhost:5432  
- **pgAdmin**: http://localhost:5050

### Health Checks
```bash
# Check service status
docker-compose logs collector
docker-compose logs dashboard
docker-compose logs supabase-db

# Check database connection
docker exec -it supabase-db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM monitored_servers;"
```

## 🔧 Administration & Maintenance

### Adding New Database Servers
1. **Via API** (Recommended):
   ```bash
   curl -X POST http://localhost:3000/api/servers \
   -H "Content-Type: application/json" \
   -d '{
     "db_type": "SQLSERVER",
     "host": "192.168.1.100", 
     "port": 1433,
     "username": "sa",
     "password": "mypassword",
     "label": "Production SQL Server"
   }'
   ```

2. **Via Environment Variables**:
   - Add server details to `.env` file
   - Restart collector service: `docker-compose restart collector`

### Monitoring Collection Status
```sql
-- Check recent collection activity  
SELECT * FROM collector_logs ORDER BY logged_at DESC LIMIT 10;

-- Verify data collection
SELECT db_type, host, COUNT(*) as metrics_count, MAX(collected_at) as last_collection
FROM backup_metrics
GROUP BY db_type, host  
ORDER BY last_collection DESC;
```

### Alert Management
```sql
-- View all active alerts
SELECT * FROM backup_alerts WHERE resolved = false;

-- Manually refresh alerts  
SELECT refresh_backup_alerts();

-- Resolve specific alerts
UPDATE backup_alerts SET resolved = true WHERE id = <alert_id>;
```

### Database Cleanup
```sql
-- Clean old metrics (older than 90 days)
DELETE FROM backup_metrics WHERE collected_at < NOW() - INTERVAL '90 days';

-- Archive resolved alerts
DELETE FROM backup_alerts WHERE resolved = true AND created_at < NOW() - INTERVAL '30 days';
```

## 🔒 Security Considerations

### Password Encryption
- All database passwords stored encrypted using pgcrypto AES-256
- Master key should be changed from default before production use
- Master key stored in environment variables, not in code

### Network Security  
- Change default PostgreSQL and pgAdmin passwords
- Use firewall rules to restrict database access
- Consider VPN/tunneling for remote database connections

### Access Control
- Dashboard has no built-in authentication (add reverse proxy auth if needed)
- pgAdmin access should be restricted to administrators only
- Database credentials have minimal required privileges

## 📊 Database-Specific Collection Details

### SQL Server
- **Source**: `msdb.dbo.backupset` table
- **Frequency**: Last 24 hours of backup history  
- **Metrics**: Full, Differential, and Log backups
- **Connection**: SQL authentication via port 1433

### Oracle Database
- **Source**: `v$rman_backup_job_details` view
- **Frequency**: Last 24 hours of RMAN jobs
- **Metrics**: Database backup types and output sizes
- **Connection**: SYS user with SYSDBA privileges via TNS

### MySQL/MariaDB  
- **Source**: Custom `backup_log` table (auto-created)
- **Frequency**: Last 7 days of logged backups
- **Setup Required**: Populate backup_log from mysqldump scripts
- **Connection**: Standard MySQL authentication

## 🚨 Troubleshooting

### Common Issues

**Collector Not Running**:
```bash
# Check collector logs  
docker-compose logs collector

# Restart collector
docker-compose restart collector
```

**Database Connection Failures**:
```bash
# Test network connectivity
docker exec -it backup-collector ping <database-host>

# Verify credentials in environment
docker exec -it backup-collector env | grep -i password
```

**No Backup Data Appearing**:
1. Verify database has backup history in expected tables/views
2. Check collection logs for SQL errors  
3. Confirm server is enabled in `monitored_servers` table
4. Validate database user permissions

**Dashboard Not Loading**:  
```bash
# Check dashboard service logs
docker-compose logs dashboard

# Verify PostgreSQL connectivity
docker exec -it backup-dashboard node -e "
const { Pool } = require('pg');
const pool = new Pool({host: 'supabase-db', user: 'postgres', password: 'postgres', database: 'postgres'});
pool.query('SELECT NOW()').then(r => console.log('OK:', r.rows[0])).catch(console.error);
"
```

### Performance Optimization
- Monitor PostgreSQL performance with pgAdmin
- Consider partitioning `backup_metrics` table for large datasets
- Archive old data to prevent unbounded growth
- Use database indexes on frequently queried columns

## 📝 Maintenance Schedule

### Daily
- Monitor dashboard for new alerts
- Verify data collection is current
- Check service logs for errors

### Weekly  
- Review RPO status and backup coverage
- Clean up resolved alerts
- Monitor disk space usage

### Monthly
- Archive old backup metrics (>90 days)
- Review and update monitored server list
- Update database credentials if rotated
- Review security and access logs

---

**Last Updated**: March 2026  
**Version**: 1.0.0  
**Maintainer**: DBA Team