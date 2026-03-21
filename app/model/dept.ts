import { DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../../config/_index";

class Dept extends Model<InferAttributes<Dept>, InferCreationAttributes<Dept>> {
  declare id: number;
  declare name: string;
  declare parentId: number;
  declare pathIds: number[]; // json: [1,2,3]
  declare pathNames: string[]; // json: ["部门","组","班"]
}

Dept.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "parent_id",
    },
    pathIds: {
      type: DataTypes.JSON,
      allowNull: false,
      field: "path_ids",
    },
    pathNames: {
      type: DataTypes.JSON,
      allowNull: false,
      field: "path_names",
    },
  },
  {
    sequelize,
    tableName: "tbl_dept",
    timestamps: false,
    underscored: false,
  },
);

export { Dept };
