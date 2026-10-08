from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import create_tables
from routers import auth, patients, sessions, feedback, training
from config import IMAGES_DIR, REPORTS_DIR

app = FastAPI(
    title="LogotherapyPro API",
    description="AI-powered speech therapy assessment platform for children",
    version="1.0.0",
)

# CORS — allow React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")
app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")

# Routers
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(sessions.router)
app.include_router(feedback.router)
app.include_router(training.router)


@app.on_event("startup")
def startup():
    create_tables()


@app.get("/health")
def health():
    return {"status": "ok"}
