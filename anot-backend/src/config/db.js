const { Pool } = require('pg')
const dotenv = require('dotenv')

dotenv.config()

// Create a connection pool to PostgreSQL
const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
})

// Test the connection when server starts
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message)
        console.error('👉 Make sure PostgreSQL is running and your .env credentials are correct')
    } else {
        console.log('✅ Connected to PostgreSQL database')
        release()
    }
})

module.exports = pool