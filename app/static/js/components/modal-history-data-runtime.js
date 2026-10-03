import { moduleState } from './modal-history-data-runtime-parts/state.js';
import { create } from './modal-history-data-runtime-parts/record-fetch-and-vitals.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

moduleState.MEDICAL_RECORD_ORGAN_FIELDS = [
	['Tuần hoàn', 'circulation'], ['Tiêu hoá', 'digestive'],
	['Thận-tiết niệu-sinh dục', 'renal_urogenital'], ['Cơ-xương-khớp', 'musculoskeletal'],
	['Tai-mũi-họng', 'ent'], ['Nội tiết-dinh dưỡng', 'endocrine_nutrition_others'],
	['Thần kinh', 'neurological']
];
moduleState.MEDICAL_RECORD_MENTAL_FIELDS = [
	['Ý thức định hướng', 'orientation'], ['Tình cảm, cảm xúc', 'emotions'],
	['Tri giác', 'perception'], ['Tư duy', 'thought'], ['Hành vi tác phong', 'behavior'],
	['Trí nhớ', 'memory'], ['Tập trung - chú ý', 'attention'], ['Trí năng', 'intelligence']
];
moduleState.MEDICAL_RECORD_LABELS = {
	doctor: { title: 'HỒ SƠ BỆNH ÁN', prefix: 'bac_si', manifestations: 'Biểu hiện chung', examination: 'KQ khám toàn thân', diagnosis: 'Chẩn đoán (ICD-10)', accompanying: 'Bệnh kèm theo', plan: 'Kết luận & Hướng Đ.trị', signer: 'Bác sĩ khám bệnh', fallbackName: 'Bác sĩ' },
	psychologist: { title: 'HỒ SƠ BỆNH ÁN TÂM LÝ', prefix: 'tam_ly_gia', manifestations: 'Đánh giá ban đầu', examination: 'Diễn tiến trong phiên khám', diagnosis: 'Triệu chứng & Hành vi', accompanying: 'Nhận định chung', plan: 'Kế hoạch can thiệp', signer: 'Tâm lý gia', fallbackName: 'Tâm lý gia' }
};

moduleState.MEDICAL_RECORD_DETAIL_LEAD = '\n\t\t\t\t\t\t\n\t\t\t\t\t\t';

export const ModalHistoryDataRuntime = Object.freeze({ create: create });
QLPKDoctorModuleRegistry.register('modalHistoryDataRuntime', ModalHistoryDataRuntime);
