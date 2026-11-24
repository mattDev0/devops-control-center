# --- Build Stage ---
FROM node:24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Final Stage ---
FROM nginxinc/nginx-unprivileged:alpine

ARG OS_PATCH_DATE=default
USER 0
RUN : "${OS_PATCH_DATE}" && apk upgrade --no-cache
USER 101

# Copy the build output to nginx static folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
