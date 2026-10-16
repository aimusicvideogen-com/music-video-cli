FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts
COPY bin ./bin
COPY src ./src
ENTRYPOINT ["node", "bin/aimusicvideogen.js", "mcp"]
