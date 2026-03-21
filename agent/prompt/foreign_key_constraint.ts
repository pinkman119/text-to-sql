function getForeignKeyConstraint(): object {
  return {
    tbl_user: {
      "dept_id=>tbl_dept.id": "1:1",
    },
  };
}

export { getForeignKeyConstraint };
