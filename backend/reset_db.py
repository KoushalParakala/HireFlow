import logging
from models.database import engine
from models import domain

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reset_db")

def reset():
    logger.info("Dropping all existing tables...")
    domain.Base.metadata.drop_all(bind=engine)
    logger.info("Recreating tables with new schema...")
    domain.Base.metadata.create_all(bind=engine)
    logger.info("Database reset complete!")

if __name__ == "__main__":
    reset()
