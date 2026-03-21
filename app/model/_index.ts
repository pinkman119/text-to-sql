import { sequelize } from "../../config/_index";
import { Dept } from "./dept";
import { User } from "./user";

// Associations
User.belongsTo(Dept, { foreignKey: "deptId", as: "dept" });
Dept.hasMany(User, { foreignKey: "deptId", as: "users" });

async function initDb() {
  await sequelize.authenticate();

  // 用sequelize的sync方法判断当前表不存在则自动建表
  await sequelize.sync({ force: false });
}

export { Dept, User, initDb, sequelize };
