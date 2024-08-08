FROM node:20-alpine
RUN mkdir -p /app
WORKDIR /app
COPY . .
ENV REDIRECTION_PATH=/app/redirection
RUN corepack enable
RUN corepack install
RUN pnpm i
EXPOSE 3018
CMD [ "pnpm", "start"]
