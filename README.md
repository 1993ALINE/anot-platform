# Anot Platform

A full-stack web application built with React, Node.js, Express, and PostgreSQL.

The project demonstrates modern web application development with a separate frontend and backend, REST API integration, authentication, request validation, database connectivity, and file upload handling.

## 🚀 Technology Stack

### Frontend

* React 19
* React Router 7
* Vite
* JavaScript / JSX
* ESLint

### Backend

* Node.js
* Express 5
* PostgreSQL
* REST APIs
* JWT authentication
* bcryptjs
* Express Validator
* Multer
* CORS
* dotenv

## 🏗️ Project Structure

```text
anot-platform/
├── anot/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
│
├── anot-backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── uploads/
│   │   ├── utils/
│   │   └── server.js
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
│
└── .gitignore
```

## 🔧 Backend Architecture

The backend is organized into separate application layers to keep the codebase maintainable:

* **Controllers** — application request handling and business logic
* **Routes** — API endpoint definitions
* **Middleware** — request processing, authentication, and validation
* **Config** — application and database configuration
* **Uploads** — file upload handling
* **Utils** — reusable backend utilities

The backend uses PostgreSQL for relational data storage and provides API endpoints consumed by the React frontend.

## 🔐 Authentication & Validation

The backend includes:

* JWT-based authentication
* Password hashing with bcryptjs
* Request validation using Express Validator
* CORS configuration
* Environment-based configuration

## 📁 File Uploads

Multer is used to support file upload handling within the backend application.

## ▶️ Running the Project

### Prerequisites

Make sure you have installed:

* Node.js
* npm
* PostgreSQL

### 1. Clone the repository

```bash
git clone https://github.com/1993ALINE/anot-platform.git
cd anot-platform
```

### 2. Configure the backend

Navigate to the backend:

```bash
cd anot-backend
npm install
```

Create a `.env` file based on `.env.example` and configure your local PostgreSQL database and application settings.

### 3. Start the backend

For development:

```bash
npm run dev
```

Or start normally:

```bash
npm start
```

The backend runs on the port configured in the environment settings.

### 4. Start the frontend

Open another terminal:

```bash
cd anot
npm install
npm run dev
```

Vite will start the frontend development server.

## 🧪 Development

The frontend includes ESLint configuration for code quality checks.

```bash
npm run lint
```

A production frontend build can be generated with:

```bash
npm run build
```

## 📌 Project Purpose

This project demonstrates practical full-stack development using a modern JavaScript frontend and Node.js backend.

It showcases experience with:

* React application development
* REST API development
* PostgreSQL database integration
* Authentication and authorization
* Backend application architecture
* Request validation
* File handling
* Frontend/backend integration
* Environment-based configuration

## 👨‍💻 Author

**Atiqur Rahman**

Software Developer specializing in Java, Spring Boot, REST APIs, backend development, databases, and full-stack web applications.
