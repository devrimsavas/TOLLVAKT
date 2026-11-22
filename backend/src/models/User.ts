import { Table, Column, Model, DataType } from "sequelize-typescript";

export const ROLES = ["user", "admin"] as const;
export type UserRole = (typeof ROLES)[number];

// The languages of the web app
export const LANGUAGES = ["nb", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

@Table({ tableName: "users", underscored: true })
export class User extends Model {
  // Internal primary key, never exposed outside the database
  @Column({ type: DataType.INTEGER, autoIncrement: true, primaryKey: true })
  declare id: number;

  // Public user number, used in the API and in tokens
  @Column({
    type: DataType.UUID,
    allowNull: false,
    unique: true,
    defaultValue: DataType.UUIDV4,
  })
  declare publicId: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare firstName: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  declare lastName: string;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  declare email: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare passwordHash: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: "user",
    validate: { isIn: [ROLES] },
  })
  declare role: UserRole;

  @Column({
    type: DataType.STRING(2),
    allowNull: false,
    defaultValue: "nb",
    validate: { isIn: [LANGUAGES] },
  })
  declare language: Language;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastLoginAt: Date | null;

  // When the password was last changed; sessions started before it are
  // no longer accepted
  @Column({ type: DataType.DATE, allowNull: true })
  declare passwordChangedAt: Date | null;

  // Classifications and model-backed searches per day; null means the
  // default (USER_DAILY_LIMIT)
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare dailyLimit: number | null;

  // An admin can close an account; a closed account cannot log in or use
  // its token
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  declare createdAt: Date;
  declare updatedAt: Date;
}
