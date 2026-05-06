FROM node:24.13.0-slim AS base

ENV NPM_HOME="/npm"
ENV PATH="$NPM_HOME:$PATH"
ENV REACT_APP_API_BASE="/api-v1/api.php"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/npm/store pnpm install --frozen-lockfile
RUN pnpm run build

# Production stage
FROM nginx:alpine-slim AS production-stage
COPY ./conf/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
