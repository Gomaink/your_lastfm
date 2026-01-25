[![Status](https://img.shields.io/badge/status-active-brightgreen)](https://github.com/seuusuario/wakeonweb)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

# Your LastFM

A containerized Node.js application that synchronizes scrobbles from **Last.fm**, stores them in a local **SQLite** database, and serves a web dashboard.

<img width="1718" height="1066" alt="image" src="https://github.com/user-attachments/assets/97d5a9f1-b39a-42ea-9acf-2b4546426a11" />

---

## Project

**Your LastFM** is a Node.js application designed to **automatically synchronize music scrobbles** from Last.fm. It preserves your listening history in a local SQLite database and serves a web interface for data visualization.

The project is fully containerized with **Docker**, using an automated entrypoint to handle database initialization and sequential execution (Syncing first, then launching the Web API). It also utilizes **PM2** as a process manager inside the container to ensure the web service remains active and resilient.

## Prerequisites

* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose](https://docs.docker.com/compose/install/)

## Installation

### Create a `.env` file

```env
LASTFM_API_KEY=your_lastfm_api_key
LASTFM_USERNAME=your_lastfm_username
```

Last.fm: Create an API account [here](https://www.last.fm/api/account/create) to get your API Key.

### Docker Compose

```yml
services:
  your-lastfm:
    image: gomaink/your-lastfm
    container_name: your-lastfm
    ports:
      - "1533:1533"
    env_file:
      - .env
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

On terminal:
`docker compose up -d`

Then access:
```
http://localhost:1533
```

(or replace `localhost` with your server IP)

## License

This project is licensed under the MIT License.
