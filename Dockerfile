FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 1533

ENTRYPOINT ["./entrypoint.sh"]