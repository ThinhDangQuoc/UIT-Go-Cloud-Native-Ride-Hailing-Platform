import pool from "../db/db.js";

// Tạo user mới
export async function createUser(email, password_hash, role, personalInfo, vehicleInfo) {
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, role, personal_info, vehicle_info) 
     VALUES ($1, $2, $3, $4, $5) 
     RETURNING id, email, role, personal_info, vehicle_info`,
    [email, password_hash, role, personalInfo || null, vehicleInfo || null]
  );
  return res.rows[0];
}

// Tìm user theo email
export async function findUserByEmail(email) {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return res.rows[0];
}

// Bổ sung: tìm user theo id
export async function findUserById(id) {
  const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return res.rows[0];
}