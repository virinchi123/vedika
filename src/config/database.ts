const encode = (value: string) => encodeURIComponent(value);

export const databaseConfig = {
  host: "localhost",
  port: 4444,
  user: "vedika",
  password: "event_manager",
  database: "vedika",
  schema: "public",
  get connectionUrl() {
    return `postgresql://${encode(this.user)}:${encode(this.password)}@${this.host}:${this.port}/${encode(this.database)}?schema=${encode(this.schema)}`;
  },
};
