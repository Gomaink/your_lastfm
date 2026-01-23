<<<<<<< HEAD
FROM node:22-slim
=======
FROM node:24-slim
>>>>>>> 152234604afd154e57935834d24c11c2b4921c14

RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*
RUN npm install pm2 -g

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
