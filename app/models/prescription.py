from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Date, Numeric, Boolean                                                                       
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class Prescription(Base):
    __tablename__ = 'prescriptions'
    
    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey('appointments.id'), nullable=False)
    prescription_code = Column(String(20), unique=True, nullable=True, index=True)  # Mã đơn thuốc (14 ký tự)
    total_amount = Column(Float, default=0)
    usage_instructions = Column('cach_dung', Text, nullable=True)
    re_examination_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    prescription_type = Column(String(10), default='BASIC')  # BASIC, H, N
    
    # Relationships
    appointment = relationship("Appointment", back_populates="prescriptions")
    items = relationship("PrescriptionItem", back_populates="prescription", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            'id': self.id,
            'appointment_id': self.appointment_id,
            'prescription_code': self.prescription_code,
            'total_amount': self.total_amount,
            'usage_instructions': self.usage_instructions,
            're_examination_date': self.re_examination_date.isoformat() if self.re_examination_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'prescription_type': self.prescription_type or 'BASIC'
        }

class PrescriptionItem(Base):
    __tablename__ = 'prescription_items'
    
    id = Column(Integer, primary_key=True, index=True)
    prescription_id = Column(Integer, ForeignKey('prescriptions.id'), nullable=False)
    medicine_id = Column(Integer, ForeignKey('medicines.id'), nullable=True, index=True)
    medicine_name = Column(String(255), nullable=False)
    unit_price = Column(Float, default=0)
    quantity = Column(Numeric(10, 3), default=1.0)  # Legacy decimals remain readable; new writes use whole dispensing units
    unit = Column(String(50), nullable=True)
    strength = Column(String(100), nullable=True)
    route = Column(String(100), nullable=True)
    usage = Column(Text, nullable=True)
    is_external = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationships
    prescription = relationship("Prescription", back_populates="items")
    medicine = relationship("Medicine")
    
    def to_dict(self):
        return {
            'id': self.id,
            'prescription_id': self.prescription_id,
            'medicine_id': self.medicine_id,
            'medicine_name': self.medicine_name,
            'unit_price': self.unit_price,
            'quantity': float(self.quantity) if self.quantity else 0.0,  # Convert Numeric to float
            'unit': self.unit,
            'strength': self.strength,
            'route': self.route,
            'usage': self.usage,
            'is_external': self.is_external if self.is_external is not None else False,
            'created_at': self.created_at.isoformat() if self.created_at else None
        } 
