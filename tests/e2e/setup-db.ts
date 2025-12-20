import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as fs from 'fs';
import * as path from 'path';

// Load standard data from jsonql-spec (assuming it's available or we copy it)
// For this implementation, I'll embed the data or read it if the path is known.
// Since we are in the workspace, I can read it from the absolute path provided in context.

const SPEC_DATA_PATH = path.resolve(__dirname, 'data/data.json');

export async function setupSQLiteDB(): Promise<Database> {
  const db = await open({
    filename: ':memory:', // Use in-memory DB for tests
    driver: sqlite3.Database,
  });

  let data: any;
  try {
    const content = fs.readFileSync(SPEC_DATA_PATH, 'utf-8');
    data = JSON.parse(content);
  } catch (e) {
    console.warn('Could not read spec data, using fallback empty data', e);
    data = {};
  }

  // Create Tables and Seed Data

  // Users
  await db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      status TEXT,
      age INTEGER,
      deleted_at TEXT
    );
  `);
  if (data.users) {
    for (const user of data.users) {
      await db.run(
        'INSERT INTO users (id, name, email, status, age, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
        user.id,
        user.name,
        user.email,
        user.status,
        user.age,
        user.deleted_at,
      );
    }
  }

  // Posts
  await db.exec(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      title TEXT,
      views INTEGER,
      published BOOLEAN
    );
  `);
  if (data.posts) {
    for (const post of data.posts) {
      await db.run(
        'INSERT INTO posts (id, user_id, title, views, published) VALUES (?, ?, ?, ?, ?)',
        post.id,
        post.user_id,
        post.title,
        post.views,
        post.published,
      );
    }
  }

  // Comments
  await db.exec(`
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY,
      post_id INTEGER,
      user_id INTEGER,
      content TEXT,
      approved BOOLEAN
    );
  `);
  if (data.comments) {
    for (const comment of data.comments) {
      await db.run(
        'INSERT INTO comments (id, post_id, user_id, content, approved) VALUES (?, ?, ?, ?, ?)',
        comment.id,
        comment.post_id,
        comment.user_id,
        comment.content,
        comment.approved,
      );
    }
  }

  return db;
}
