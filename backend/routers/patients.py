from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db, Patient, Therapist
from auth import get_current_therapist
from schemas import PatientCreate, PatientUpdate, PatientOut

router = APIRouter(prefix="/patients", tags=["patients"])


@router.post("", response_model=PatientOut, status_code=201)
def create_patient(
    data: PatientCreate,
    db: Session = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    patient = Patient(**data.model_dump(), therapist_id=therapist.id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@router.get("", response_model=List[PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    return db.query(Patient).filter(Patient.therapist_id == therapist.id).all()


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    patient = db.query(Patient).filter(
        Patient.id == patient_id, Patient.therapist_id == therapist.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int,
    data: PatientUpdate,
    db: Session = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    patient = db.query(Patient).filter(
        Patient.id == patient_id, Patient.therapist_id == therapist.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.delete("/{patient_id}", status_code=204)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    therapist: Therapist = Depends(get_current_therapist),
):
    patient = db.query(Patient).filter(
        Patient.id == patient_id, Patient.therapist_id == therapist.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
