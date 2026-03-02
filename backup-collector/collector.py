import os
import time
import psycopg2

SUPABASE_HOST = os.getenv("SUPABASE_HOST", "supabase-db")
SUPABASE_USER = os.getenv("SUPABASE_USER", "postgres")
SUPABASE_PASSWORD = os.getenv("SUPABASE_PASSWORD", "postgres")
SUPABASE_DB = os.getenv("SUPABASE_DB", "postgres")


def get_connection():
    return psycopg2.connect(
        host=SUPABASE_HOST,
        user=SUPABASE_USER,
        password=SUPABASE_PASSWORD,
        dbname=SUPABASE_DB,
    )


def collect():
    print("Connecting to database...")
    conn = get_connection()
    print("Connected.")
    conn.close()


if __name__ == "__main__":
    while True:
        try:
            collect()
        except Exception as e:
            print(f"Error: {e}")
        time.sleep(60)
