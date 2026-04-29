const pool = require('../config/db')

const auditLog = async (user, action, entityType, entityId, details) => {
    try {
        await pool.query(
            `INSERT INTO audit_logs
             (user_id, user_name, user_role, action, entity_type, entity_id, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                user?.id     || null,
                user?.name   || 'System',
                user?.role   || 'system',
                action,
                entityType   || null,
                entityId     || null,
                details      || null,
            ]
        )
    } catch (err) {
        console.error('Audit log error:', err.message)
    }
}

module.exports = { auditLog }