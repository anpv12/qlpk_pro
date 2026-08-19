ADDRESS_COMPONENT_FIELDS = ("address_detail", "ward", "district", "province")


def normalize_address_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def build_full_address(address_detail=None, ward=None, district=None, province=None):
    parts = [
        normalize_address_text(address_detail),
        normalize_address_text(ward),
        normalize_address_text(district),
        normalize_address_text(province),
    ]
    return ", ".join(part for part in parts if part) or None


def apply_patient_address_update(patient, data):
    """Update address without letting empty structured fields erase legacy full address."""
    component_payload = {field: data[field] for field in ADDRESS_COMPONENT_FIELDS if field in data}
    has_component_payload = bool(component_payload)
    has_non_empty_component = any(normalize_address_text(value) for value in component_payload.values())
    has_address_text = "address" in data
    address_text = normalize_address_text(data.get("address"))

    if has_component_payload and has_non_empty_component:
        for field, value in component_payload.items():
            setattr(patient, field, value)
        patient.address = build_full_address(
            address_detail=patient.address_detail,
            ward=patient.ward,
            district=patient.district,
            province=patient.province,
        )
        return True

    if has_component_payload:
        if has_address_text and address_text:
            patient.address = address_text
            return True
        for field, value in component_payload.items():
            setattr(patient, field, value)
        patient.address = None
        return True

    if has_address_text:
        patient.address = address_text
        return True

    return False
