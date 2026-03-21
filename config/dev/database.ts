import { Sequelize } from "sequelize";

type DatabaseConfig = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  dialect: "mysql";
  timezone?: string;
  logging?: boolean;
};

const databaseConfig: DatabaseConfig = {
  host: "127.0.0.1",
  port: 3306,
  database: "ehr_dev",
  username: "root",
  password: "password",
  dialect: "mysql",
  timezone: "+08:00",
  // 默认：development 打印 SQL；也可用 DB_LOGGING=true/false 强制覆盖
  logging:
    process.env.DB_LOGGING != null
      ? process.env.DB_LOGGING.toLowerCase() === "true"
      : process.env.NODE_ENV === "development",
};

// Sequelize instance
const sequelize = new Sequelize(
  databaseConfig.database,
  databaseConfig.username,
  databaseConfig.password,
  {
    host: databaseConfig.host,
    port: databaseConfig.port,
    dialect: databaseConfig.dialect,
    timezone: databaseConfig.timezone,
    logging: databaseConfig.logging ? console.log : false,
  },
);

export type { DatabaseConfig };
export { databaseConfig, sequelize };
