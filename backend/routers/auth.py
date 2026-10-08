from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db, Therapist
from auth import hash_password, verify_password, create_access_token, get_current_therapist
from schemas import TherapistRegister, Token, TherapistOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TherapistOut, status_code=201)
def register(data: TherapistRegister, db: Session = Depends(get_db)):
    if db.query(Therapist).filter(Therapist.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    therapist = Therapist(
        email=data.email,
        password_hash=hash_password(data.password),
        name=data.name,
        preferred_language=data.preferred_language,
    )
    db.add(therapist)
    db.commit()
    db.refresh(therapist)
    return therapist


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    therapist = db.query(Therapist).filter(Therapist.email == form.username).first()
    if not therapist or not verify_password(form.password, therapist.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": create_access_token(therapist.id), "token_type": "bearer"}


@router.get("/me", response_model=TherapistOut)
def me(current: Therapist = Depends(get_current_therapist)):
    return current
