# 1 Million Checkboxes Clone

A scalable, real-time web application where users can collaboratively toggle checkboxes in a persistent state. This project is a modern implementation of the popular "One Million Checkboxes" concept, enhanced with real-time updates via WebSockets, Google OAuth integration, and rate-limiting using Redis.

## 🚀 Project Overview

The core idea is simple: a shared grid of checkboxes that anyone can interact with. When one person toggles a checkbox, everyone connected to the site sees the change instantly. Behind the scenes, the application leverages Node.js, Express, Socket.IO, PostgreSQL, and Redis to handle concurrent connections, synchronize state changes reliably, and persist data at scale.

## 🛠️ Tech Stack

**Backend:**
- **Node.js & Express.js:** The core web server handling API routing and HTTP requests.
- **Socket.IO:** Powers the bidirectional real-time communication between clients and the server.
- **PostgreSQL (via `pg` & `connect-pg-simple`):** Serves as the primary database for user accounts and secure session persistence.
- **Redis (via `ioredis`):** Used extensively for:
  - In-memory cache for ultra-fast reading/writing of the massive checkbox state.
  - Pub/Sub architecture for multi-node scalability (`publisher` & `subscriber`).
  - Rate limiting logic using Sorted Sets.
- **Passport.js:** Authentication middleware integrating the Google OAuth 2.0 strategy.

**Frontend:**
- **Vanilla HTML/CSS/JS:** Lightweight frontend without heavy frameworks for maximum performance.
- **Socket.IO Client:** Listens to server events and emits user interactions.
- **Responsive CSS & Animations:** Premium modern UI featuring glassmorphism, noise textures, toast notifications, and smooth CSS animations.

## ✨ Features Implemented

- **Real-Time Synchronization:** Seamless, instant syncing of checkbox states across all connected clients via Socket.IO.
- **Google OAuth Integration:** Secure user authentication restricting interaction to logged-in users only.
- **Read-Only Mode:** Unauthenticated users can view the live grid and updates but cannot toggle checkboxes.
- **Rate Limiting:** Prevents abuse and spamming by tracking individual user activity with Redis sliding windows.
- **Live Connection Tracking:** Visual indicator showing if the client is connected to the live stream.
- **Optimistic UI Updates:** UI updates immediately on click while processing the network request, rolling back dynamically if an error occurs.
- **Scalable Pub/Sub Architecture:** Internally routes WebSocket events through Redis channels, making the backend horizontally scalable.
- **Robust Session Management:** Persistent sessions stored securely in PostgreSQL.

## 🏃‍♂️ How to Run Locally

### Prerequisites
- [Node.js](https://nodejs.org/en/) (v18+)
- [Docker & Docker Compose](https://www.docker.com/) (For running PostgreSQL and Redis locally)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone <your-repository-url>
   cd 100-check-box
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start Database Services (Redis & PostgreSQL):**
   ```bash
   # Run the provided Docker Compose configuration
   docker compose up -d
   ```

4. **Environment Configuration:**
   - Copy the `.env.example` file to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Update `.env` with your Google OAuth credentials and desired secrets (see the "Environment Variables" section below).

5. **Run the Application:**
   ```bash
   # Start in development mode with nodemon
   npm run dev
   
   # OR start in standard mode
   npm start
   ```

6. **Open in Browser:**
   Navigate to `http://localhost:8000`

## 🔐 Environment Variables Required

Create a `.env` file in the root directory containing the following:

```env
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Security
SESSION_SECRET=a_secure_random_string

# PostgreSQL connection
DATABASE_URL=postgresql://postgres:password@localhost:5432/location_db

# Server port (optional, defaults to 8000)
PORT=8000
```

## 🗄️ Redis Setup Instructions

Redis is essential for this application as it powers state caching, Pub/Sub, and rate-limiting.

**Using Docker (Recommended):**
The project includes a `docker-compose.yml` file that provisions the necessary Redis (Valkey) and PostgreSQL instances.
Simply run:
```bash
docker compose up -d
```
This maps Redis to `localhost:6379`, which matches the default connection settings in `redis-connection.js`.

**Manual Setup:**
If you prefer running Redis manually, ensure your local instance or cloud Redis provider is accessible on `localhost:6379` (or update `redis-connection.js` accordingly).

## 🛡️ Auth Flow Explanation

1. **Initiation:** The user clicks "Sign in with Google", which redirects them to the `/auth/google` route.
2. **Passport.js Interception:** Passport redirects the request to Google's OAuth 2.0 consent screen requesting `profile` and `email` scopes.
3. **Callback:** Google responds by hitting `/auth/google/callback` with an authorization code.
4. **Verification & Storage:**
   - Passport exchanges the code for a profile.
   - The backend runs `findOrCreateUser()` (in `db.js`), which checks PostgreSQL to see if the user exists. If not, it creates a new record.
5. **Session Creation:** `express-session` backed by `connect-pg-simple` serializes the user ID into a secure HTTP-only cookie.
6. **Socket Sharing:** The express session middleware is injected into `io.engine.use()`, meaning Socket.IO connections natively understand HTTP session cookies and automatically populate `socket.request.user`.

## ⚡ WebSocket Flow Explanation

1. **Connection:** When the client loads the page, `io()` initializes a WebSocket connection.
2. **Hydration:** The server parses the HTTP session from the socket handshake. It emits an `auth:state` event down to the client so the frontend knows if the user is logged in.
3. **Interaction:**
   - A logged-in user clicks a checkbox. The frontend optimistically animates the check and emits `user:checked` to the server with the `index` and `checked` boolean.
4. **Server Validation:**
   - The server verifies `userId` exists (preventing unauthenticated writes).
   - The server validates the input limits and rate-limits the user.
5. **State Update & Propagation:**
   - The server updates the state array stored in Redis.
   - The server publishes the update to the internal Redis Pub/Sub channel (`internalServer:checkBox`).
6. **Broadcasting:** 
   - All server instances listening to `internalServer:checkBox` receive the message and use `io.emit("user:checked", payload)` to broadcast the change to every connected WebSocket client.
7. **Client Rendering:** Other clients receive `user:checked` and visually update the corresponding checkbox.

## ⏱️ Rate Limiting Logic Explanation

To prevent spam and ensure server stability, we utilize a custom Redis-based sliding window rate limiter:

1. **Key Generation:** A unique Redis key is generated per user (e.g., `rateLimit:<userId>`).
2. **Window Definition:** We define a rolling window of 5 seconds (`windowMs`) and a maximum limit of 10 operations (`max`).
3. **Pruning:** Using `redis.zremrangebyscore()`, we remove any stored timestamps from the Sorted Set that fall outside the current 5-second window.
4. **Counting:** We count the remaining items in the set using `redis.zcard()`. If the count exceeds our `max` (10), the server immediately drops the request and emits a `RATE_LIMITED` error event to the client.
5. **Recording:** If allowed, we add the current timestamp to the Sorted Set using `redis.zadd()`, assigning an expiration to the entire key so Redis cleans it up automatically when the user goes idle.

## 🖼️ Screenshots or Demo Link

*(Add screenshots of your UI here or link to a live deployed demo)*

**Example UI View:**
> A premium, dark-mode focused UI showing a live grid of interactive checkboxes with real-time statistics updating on the fly.
## Youtube Link 

https://youtu.be/d_obXQzECNE
