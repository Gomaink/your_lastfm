[![Status](https://img.shields.io/badge/status-active-brightgreen)](https://github.com/seuusuario/wakeonweb)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

# Your LastFM

A containerized Node.js application that synchronizes scrobbles from **Last.fm** and **Spotify**, stores them in a local **SQLite** database, and serves a web dashboard.

![](https://i.imgur.com/4oiHM9D.png)

---

## Project

**Your LastFM** is a Node.js application designed to **automatically synchronize music scrobbles** between Last.fm and Spotify. It preserves your listening history in a local SQLite database and serves a web interface for data visualization.

The project is fully containerized with **Docker**, using an automated entrypoint to handle database initialization and sequential execution (Syncing first, then launching the Web API). It also utilizes **PM2** as a process manager inside the container to ensure the web service remains active and resilient.

## Prerequisites

* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose](https://docs.docker.com/compose/install/)

## Configuration

**Clone the repository:**
  ```bash
  git clone https://github.com/Gomaink/your_lastfm.git
  cd your_lastfm
  ```
**Setup environment variables:** 

Create a environment file

In your terminal, run:

  ```bash
  nano .env
  ```

Copy and paste the following template:
  ```bash
  LASTFM_API_KEY=your_key_here
  LASTFM_USERNAME=your_username_here
  SPOTIFY_CLIENT_ID=your_id_here
  SPOTIFY_CLIENT_SECRET=your_secret_here
  ```
Press Ctrl + O then Enter to save, and Ctrl + X to exit.

## Usage

To build and start the application in detached mode (running in the background):
  ```
  docker compose up --build -d
  ```

Then, wait for the scrobbles to synchronize (this may take a while, check the logs).

Finally, access the website at http://yourip:1533/

## License

This project is licensed under the MIT License.
