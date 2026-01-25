FROM node:22-slim

RUN apt-get update && apt-get install -y \
  sqlite3 \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  build-essential \
  python3 \
  && rm -rf /var/lib/apt/lists/*

RUN npm install pm2 -g

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
