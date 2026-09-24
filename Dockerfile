FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml .pnpmrc ./
RUN pnpm install --prod

COPY . .

EXPOSE 3050

CMD ["pnpm", "start"]

