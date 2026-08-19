#!/usr/bin/env python3
"""
Script để tạo nhiều mẫu khảo sát tâm lý vào database
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import get_db
from app.models.survey_template import SurveyTemplate
from app.models.user import User
import json
from datetime import datetime

# Dữ liệu các mẫu khảo sát tâm lý
SURVEY_TEMPLATES = [
    {
        "name": "DASS-42 - Depression Anxiety Stress Scale (Đầy đủ)",
        "description": "Bảng đánh giá mức độ trầm cảm, lo âu và căng thẳng gồm 42 câu hỏi. Đây là phiên bản đầy đủ của DASS-21.",
        "content": [
            {
                "id": "1",
                "question": "Tôi thấy khó khăn để thư giãn",
                "type": "multiple_choice",
                "criteria": "stress",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Đôi khi", "score": 1},
                    {"text": "Thường xuyên", "score": 2},
                    {"text": "Luôn luôn", "score": 3}
                ]
            },
            {
                "id": "2",
                "question": "Tôi cảm thấy miệng khô",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Đôi khi", "score": 1},
                    {"text": "Thường xuyên", "score": 2},
                    {"text": "Luôn luôn", "score": 3}
                ]
            },
            {
                "id": "3",
                "question": "Tôi không thể cảm nhận được cảm xúc tích cực",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Đôi khi", "score": 1},
                    {"text": "Thường xuyên", "score": 2},
                    {"text": "Luôn luôn", "score": 3}
                ]
            }
            # Thêm 39 câu hỏi nữa để đủ 42 câu
        ]
    },
    {
        "name": "PHQ-9 - Patient Health Questionnaire",
        "description": "Bảng câu hỏi sức khỏe bệnh nhân 9 câu hỏi để đánh giá mức độ trầm cảm.",
        "content": [
            {
                "id": "1",
                "question": "Ít quan tâm hoặc không thích thú làm việc gì",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "2",
                "question": "Cảm thấy buồn, chán nản, hoặc tuyệt vọng",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "3",
                "question": "Khó ngủ hoặc ngủ quá nhiều",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "4",
                "question": "Cảm thấy mệt mỏi hoặc thiếu năng lượng",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "5",
                "question": "Ăn kém hoặc ăn quá nhiều",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "6",
                "question": "Cảm thấy tồi tệ về bản thân - hoặc cảm thấy mình là người thất bại hoặc đã làm gia đình thất vọng",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "7",
                "question": "Khó tập trung vào những việc như đọc báo hoặc xem TV",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "8",
                "question": "Di chuyển hoặc nói chuyện chậm đến mức người khác có thể nhận thấy. Hoặc ngược lại - cảm thấy bồn chồn hoặc phải di chuyển nhiều hơn bình thường",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            },
            {
                "id": "9",
                "question": "Nghĩ rằng tốt hơn là chết hoặc làm tổn thương bản thân theo cách nào đó",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Vài ngày", "score": 1},
                    {"text": "Hơn nửa số ngày", "score": 2},
                    {"text": "Gần như mỗi ngày", "score": 3}
                ]
            }
        ]
    },
    {
        "name": "HAM-A - Hamilton Anxiety Rating Scale",
        "description": "Thang đánh giá lo âu Hamilton gồm 14 câu hỏi để đánh giá mức độ lo âu.",
        "content": [
            {
                "id": "1",
                "question": "Tâm trạng lo âu",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "2",
                "question": "Căng thẳng",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "3",
                "question": "Sợ hãi",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "4",
                "question": "Mất ngủ",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "5",
                "question": "Khó tập trung",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "6",
                "question": "Trầm cảm",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "7",
                "question": "Cảm giác cơ thể",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "8",
                "question": "Triệu chứng cơ thể (cơ)",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "9",
                "question": "Triệu chứng cơ thể (cảm giác)",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "10",
                "question": "Triệu chứng tim mạch",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "11",
                "question": "Triệu chứng hô hấp",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "12",
                "question": "Triệu chứng tiêu hóa",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "13",
                "question": "Triệu chứng tiết niệu",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "14",
                "question": "Hành vi trong phỏng vấn",
                "type": "multiple_choice",
                "criteria": "anxiety",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            }
        ]
    },
    {
        "name": "HAM-D - Hamilton Depression Rating Scale",
        "description": "Thang đánh giá trầm cảm Hamilton gồm 17 câu hỏi để đánh giá mức độ trầm cảm.",
        "content": [
            {
                "id": "1",
                "question": "Tâm trạng trầm cảm",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Chỉ khi được hỏi", "score": 1},
                    {"text": "Báo cáo tự phát", "score": 2},
                    {"text": "Thể hiện qua lời nói và hành vi", "score": 3},
                    {"text": "Chỉ thể hiện qua hành vi", "score": 4}
                ]
            },
            {
                "id": "2",
                "question": "Cảm giác tội lỗi",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Tự trách mình", "score": 1},
                    {"text": "Cảm giác tội lỗi", "score": 2},
                    {"text": "Bệnh hiện tại là hình phạt", "score": 3},
                    {"text": "Hoang tưởng tội lỗi", "score": 4}
                ]
            },
            {
                "id": "3",
                "question": "Tự tử",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Cảm thấy cuộc sống không đáng sống", "score": 1},
                    {"text": "Ước muốn chết", "score": 2},
                    {"text": "Ý tưởng hoặc hành vi tự tử", "score": 3},
                    {"text": "Cố gắng tự tử nghiêm trọng", "score": 4}
                ]
            },
            {
                "id": "4",
                "question": "Mất ngủ đầu đêm",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Khó ngủ", "score": 1},
                    {"text": "Mất ngủ rõ rệt", "score": 2}
                ]
            },
            {
                "id": "5",
                "question": "Mất ngủ giữa đêm",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Thức giấc", "score": 1},
                    {"text": "Thức giấc sớm", "score": 2}
                ]
            },
            {
                "id": "6",
                "question": "Mất ngủ cuối đêm",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Thức dậy sớm", "score": 1},
                    {"text": "Thức dậy rất sớm", "score": 2}
                ]
            },
            {
                "id": "7",
                "question": "Công việc và hoạt động",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Mệt mỏi, yếu sức", "score": 1},
                    {"text": "Mất hứng thú", "score": 2},
                    {"text": "Giảm hoạt động", "score": 3},
                    {"text": "Ngừng hoạt động", "score": 4}
                ]
            },
            {
                "id": "8",
                "question": "Ức chế tâm thần vận động",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Chậm chạp", "score": 1},
                    {"text": "Rõ rệt", "score": 2},
                    {"text": "Khó nói", "score": 3},
                    {"text": "Sững sờ", "score": 4}
                ]
            },
            {
                "id": "9",
                "question": "Kích động tâm thần vận động",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Bồn chồn", "score": 1},
                    {"text": "Rõ rệt", "score": 2},
                    {"text": "Không thể ngồi yên", "score": 3},
                    {"text": "Vặn vẹo, gãi", "score": 4}
                ]
            },
            {
                "id": "10",
                "question": "Lo âu tâm thần",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "11",
                "question": "Lo âu cơ thể",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Vừa", "score": 2},
                    {"text": "Nặng", "score": 3},
                    {"text": "Rất nặng", "score": 4}
                ]
            },
            {
                "id": "12",
                "question": "Triệu chứng tiêu hóa",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Chán ăn", "score": 1},
                    {"text": "Ăn phải ép", "score": 2}
                ]
            },
            {
                "id": "13",
                "question": "Triệu chứng toàn thân",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nặng", "score": 1},
                    {"text": "Rất nặng", "score": 2}
                ]
            },
            {
                "id": "14",
                "question": "Triệu chứng sinh dục",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhẹ", "score": 1},
                    {"text": "Nặng", "score": 2}
                ]
            },
            {
                "id": "15",
                "question": "Nghi ngờ bản thân",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Tự trách mình", "score": 1},
                    {"text": "Cảm giác tội lỗi", "score": 2},
                    {"text": "Hoang tưởng tội lỗi", "score": 3},
                    {"text": "Hoang tưởng tội lỗi nặng", "score": 4}
                ]
            },
            {
                "id": "16",
                "question": "Giảm cân",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Có thể có", "score": 1},
                    {"text": "Rõ rệt", "score": 2}
                ]
            },
            {
                "id": "17",
                "question": "Nhận thức về bệnh",
                "type": "multiple_choice",
                "criteria": "depression",
                "options": [
                    {"text": "Không có", "score": 0},
                    {"text": "Nhận thức một phần", "score": 1},
                    {"text": "Nhận thức đầy đủ", "score": 2}
                ]
            }
        ]
    },
    {
        "name": "MMSE - Mini-Mental State Examination",
        "description": "Thang đánh giá trạng thái tâm thần tối thiểu, dùng để sàng lọc sa sút trí tuệ. Gồm 11 câu hỏi đánh giá định hướng, ghi nhớ, chú ý, tính toán, nhớ lại, ngôn ngữ.",
        "content": [
            {
                "id": "1",
                "question": "Định hướng thời gian: Hôm nay là ngày tháng năm nào?",
                "type": "date",
                "criteria": "orientation",
                "required": True
            },
            {
                "id": "2",
                "question": "Định hướng thời gian: Bây giờ là mùa gì?",
                "type": "dropdown",
                "criteria": "orientation",
                "options": [
                    {"text": "Xuân", "score": 1},
                    {"text": "Hạ", "score": 1},
                    {"text": "Thu", "score": 1},
                    {"text": "Đông", "score": 1}
                ]
            },
            {
                "id": "3",
                "question": "Định hướng địa điểm: Chúng ta đang ở đâu?",
                "type": "short_answer",
                "criteria": "orientation",
                "required": True
            },
            {
                "id": "4",
                "question": "Ghi nhớ: Tôi sẽ đọc 3 từ, bạn hãy nhắc lại: Táo, Bàn, Tiền",
                "type": "checkbox",
                "criteria": "memory",
                "options": [
                    {"text": "Táo", "score": 1},
                    {"text": "Bàn", "score": 1},
                    {"text": "Tiền", "score": 1}
                ]
            },
            {
                "id": "5",
                "question": "Chú ý và tính toán: Hãy đếm ngược từ 100, trừ đi 7 mỗi lần (100, 93, 86, ...)",
                "type": "short_answer",
                "criteria": "attention",
                "required": True
            },
            {
                "id": "6",
                "question": "Nhớ lại: Hãy nhắc lại 3 từ tôi đã đọc trước đó",
                "type": "checkbox",
                "criteria": "recall",
                "options": [
                    {"text": "Táo", "score": 1},
                    {"text": "Bàn", "score": 1},
                    {"text": "Tiền", "score": 1}
                ]
            },
            {
                "id": "7",
                "question": "Ngôn ngữ: Hãy đặt tên cho các đồ vật này",
                "type": "short_answer",
                "criteria": "language",
                "required": True
            },
            {
                "id": "8",
                "question": "Lặp lại câu: 'Không có nếu, và, hoặc nhưng'",
                "type": "paragraph",
                "criteria": "language",
                "required": True
            },
            {
                "id": "9",
                "question": "Làm theo lệnh: 'Hãy cầm tờ giấy bằng tay phải, gấp đôi, và đặt lên sàn'",
                "type": "checkbox",
                "criteria": "language",
                "options": [
                    {"text": "Cầm bằng tay phải", "score": 1},
                    {"text": "Gấp đôi", "score": 1},
                    {"text": "Đặt lên sàn", "score": 1}
                ]
            },
            {
                "id": "10",
                "question": "Viết một câu hoàn chỉnh",
                "type": "paragraph",
                "criteria": "language",
                "required": True
            },
            {
                "id": "11",
                "question": "Sao chép hình vẽ (hình ngũ giác)",
                "type": "short_answer",
                "criteria": "visuospatial",
                "required": True
            }
        ]
    },
    {
        "name": "MoCA - Montreal Cognitive Assessment",
        "description": "Đánh giá nhận thức Montreal, dùng để sàng lọc suy giảm nhận thức nhẹ. Gồm các bài test về chú ý, trí nhớ, ngôn ngữ, chức năng điều hành, trí nhớ thị giác-không gian.",
        "content": [
            {
                "id": "1",
                "question": "Định hướng: Ngày tháng năm hiện tại?",
                "type": "date",
                "criteria": "orientation",
                "required": True
            },
            {
                "id": "2",
                "question": "Định hướng: Địa điểm hiện tại?",
                "type": "short_answer",
                "criteria": "orientation",
                "required": True
            },
            {
                "id": "3",
                "question": "Ghi nhớ: Nhắc lại 5 từ: Mặt, Lụa, Củ cải, Xanh, Nhà thờ",
                "type": "checkbox",
                "criteria": "memory",
                "options": [
                    {"text": "Mặt", "score": 1},
                    {"text": "Lụa", "score": 1},
                    {"text": "Củ cải", "score": 1},
                    {"text": "Xanh", "score": 1},
                    {"text": "Nhà thờ", "score": 1}
                ]
            },
            {
                "id": "4",
                "question": "Chú ý: Đếm ngược từ 100, trừ đi 3 mỗi lần",
                "type": "short_answer",
                "criteria": "attention",
                "required": True
            },
            {
                "id": "5",
                "question": "Chú ý: Đọc các chữ cái, chỉ vỗ tay khi nghe thấy chữ A",
                "type": "short_answer",
                "criteria": "attention",
                "required": True
            },
            {
                "id": "6",
                "question": "Ngôn ngữ: Đặt tên các con vật",
                "type": "short_answer",
                "criteria": "language",
                "required": True
            },
            {
                "id": "7",
                "question": "Trí nhớ thị giác-không gian: Vẽ đồng hồ (10 giờ 10 phút)",
                "type": "short_answer",
                "criteria": "visuospatial",
                "required": True
            },
            {
                "id": "8",
                "question": "Chức năng điều hành: Vẽ đường nối các số và chữ cái theo thứ tự",
                "type": "short_answer",
                "criteria": "executive",
                "required": True
            },
            {
                "id": "9",
                "question": "Trừu tượng: Giải thích sự giống nhau giữa Quả cam và Quả chuối",
                "type": "paragraph",
                "criteria": "abstract",
                "required": True
            },
            {
                "id": "10",
                "question": "Nhớ lại: Nhắc lại 5 từ đã đọc trước đó",
                "type": "checkbox",
                "criteria": "recall",
                "options": [
                    {"text": "Mặt", "score": 1},
                    {"text": "Lụa", "score": 1},
                    {"text": "Củ cải", "score": 1},
                    {"text": "Xanh", "score": 1},
                    {"text": "Nhà thờ", "score": 1}
                ]
            }
        ]
    },
    {
        "name": "ADHD Screening - Sàng lọc Rối loạn Tăng động Giảm chú ý",
        "description": "Bảng câu hỏi sàng lọc rối loạn tăng động giảm chú ý (ADHD) ở người lớn. Đánh giá các triệu chứng về sự chú ý, tăng động và bốc đồng.",
        "content": [
            {
                "id": "1",
                "question": "Trong 6 tháng qua, bạn có thường xuyên gặp khó khăn trong việc chú ý đến chi tiết hoặc mắc lỗi do bất cẩn trong công việc hoặc các hoạt động khác không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "2",
                "question": "Bạn có thường xuyên gặp khó khăn trong việc duy trì sự chú ý trong các nhiệm vụ hoặc hoạt động vui chơi không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "3",
                "question": "Bạn có thường xuyên có vẻ như không lắng nghe khi người khác nói chuyện trực tiếp với bạn không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "4",
                "question": "Bạn có thường xuyên không tuân theo hướng dẫn và không hoàn thành công việc, nhiệm vụ tại nơi làm việc hoặc các nghĩa vụ khác không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "5",
                "question": "Bạn có thường xuyên gặp khó khăn trong việc tổ chức các nhiệm vụ và hoạt động không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "6",
                "question": "Bạn có thường xuyên tránh né, không thích hoặc miễn cưỡng tham gia các nhiệm vụ đòi hỏi nỗ lực tinh thần kéo dài không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "7",
                "question": "Bạn có thường xuyên làm mất các vật dụng cần thiết cho công việc hoặc hoạt động không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "8",
                "question": "Bạn có thường xuyên bị phân tâm bởi các kích thích bên ngoài không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "9",
                "question": "Bạn có thường xuyên quên các hoạt động hàng ngày không?",
                "type": "linear_scale",
                "criteria": "attention",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "10",
                "question": "Bạn có thường xuyên cựa quậy, vặn vẹo tay chân hoặc ngồi không yên không?",
                "type": "linear_scale",
                "criteria": "hyperactivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "11",
                "question": "Bạn có thường xuyên rời khỏi chỗ ngồi trong các tình huống được mong đợi phải ngồi yên không?",
                "type": "linear_scale",
                "criteria": "hyperactivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "12",
                "question": "Bạn có thường xuyên chạy nhảy hoặc leo trèo trong các tình huống không phù hợp không?",
                "type": "linear_scale",
                "criteria": "hyperactivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "13",
                "question": "Bạn có thường xuyên nói quá nhiều không?",
                "type": "linear_scale",
                "criteria": "hyperactivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "14",
                "question": "Bạn có thường xuyên buột miệng trả lời trước khi câu hỏi được hỏi xong không?",
                "type": "linear_scale",
                "criteria": "impulsivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "15",
                "question": "Bạn có thường xuyên gặp khó khăn trong việc chờ đợi đến lượt mình không?",
                "type": "linear_scale",
                "criteria": "impulsivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "16",
                "question": "Bạn có thường xuyên làm gián đoạn hoặc xâm phạm người khác không?",
                "type": "linear_scale",
                "criteria": "impulsivity",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hiếm khi",
                    "2": "Đôi khi",
                    "3": "Thường xuyên",
                    "4": "Rất thường xuyên"
                }
            }
        ]
    },
    {
        "name": "CARS - Childhood Autism Rating Scale",
        "description": "Thang đánh giá tự kỷ ở trẻ em. Đánh giá 15 lĩnh vực hành vi liên quan đến tự kỷ, mỗi lĩnh vực được đánh giá từ 1-4 điểm.",
        "content": [
            {
                "id": "1",
                "question": "Mối quan hệ với người khác",
                "type": "linear_scale",
                "criteria": "social",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "2",
                "question": "Bắt chước",
                "type": "linear_scale",
                "criteria": "social",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "3",
                "question": "Phản ứng cảm xúc",
                "type": "linear_scale",
                "criteria": "emotional",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "4",
                "question": "Sử dụng cơ thể",
                "type": "linear_scale",
                "criteria": "body",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "5",
                "question": "Sử dụng đồ vật",
                "type": "linear_scale",
                "criteria": "object",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "6",
                "question": "Thích ứng với thay đổi",
                "type": "linear_scale",
                "criteria": "adaptation",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "7",
                "question": "Phản ứng thị giác",
                "type": "linear_scale",
                "criteria": "visual",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "8",
                "question": "Phản ứng thính giác",
                "type": "linear_scale",
                "criteria": "auditory",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "9",
                "question": "Phản ứng vị giác, khứu giác và xúc giác",
                "type": "linear_scale",
                "criteria": "sensory",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "10",
                "question": "Sợ hãi hoặc lo lắng",
                "type": "linear_scale",
                "criteria": "fear",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "11",
                "question": "Giao tiếp bằng lời nói",
                "type": "linear_scale",
                "criteria": "communication",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "12",
                "question": "Giao tiếp không lời",
                "type": "linear_scale",
                "criteria": "communication",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "13",
                "question": "Mức độ hoạt động",
                "type": "linear_scale",
                "criteria": "activity",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "14",
                "question": "Mức độ và chất lượng trí tuệ",
                "type": "linear_scale",
                "criteria": "intelligence",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            },
            {
                "id": "15",
                "question": "Ấn tượng tổng thể",
                "type": "linear_scale",
                "criteria": "overall",
                "min": 1,
                "max": 4,
                "labels": {
                    "1": "Không có dấu hiệu bất thường",
                    "2": "Nhẹ - hơi bất thường",
                    "3": "Vừa - rõ rệt bất thường",
                    "4": "Nặng - rất bất thường"
                }
            }
        ]
    },
    {
        "name": "PHQ-15 - Patient Health Questionnaire (Triệu chứng cơ thể)",
        "description": "Bảng câu hỏi sức khỏe bệnh nhân 15 câu hỏi để đánh giá mức độ nghiêm trọng của các triệu chứng cơ thể.",
        "content": [
            {
                "id": "1",
                "question": "Đau dạ dày",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "2",
                "question": "Đau lưng",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "3",
                "question": "Đau tay, chân, khớp",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "4",
                "question": "Đau đầu",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "5",
                "question": "Đau ngực",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "6",
                "question": "Chóng mặt",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "7",
                "question": "Ngất xỉu",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "8",
                "question": "Đánh trống ngực",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "9",
                "question": "Khó thở",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "10",
                "question": "Đau hoặc khó chịu khi quan hệ tình dục",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "11",
                "question": "Táo bón, tiêu chảy hoặc khó tiêu",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "12",
                "question": "Buồn nôn, đầy hơi hoặc khó chịu ở bụng",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "13",
                "question": "Cảm thấy mệt mỏi hoặc thiếu năng lượng",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "14",
                "question": "Khó ngủ",
                "type": "linear_scale",
                "criteria": "somatic",
                "min": 0,
                "max": 2,
                "labels": {
                    "0": "Không có",
                    "1": "Có nhưng không ảnh hưởng",
                    "2": "Có và ảnh hưởng nhiều"
                }
            },
            {
                "id": "15",
                "question": "Các triệu chứng cơ thể khác",
                "type": "paragraph",
                "criteria": "somatic",
                "required": False
            }
        ]
    },
    {
        "name": "SF-36 - Short Form Health Survey",
        "description": "Khảo sát sức khỏe ngắn gọn 36 câu hỏi, đánh giá chất lượng cuộc sống liên quan đến sức khỏe. Bao gồm 8 lĩnh vực: chức năng thể chất, vai trò thể chất, đau cơ thể, sức khỏe tổng thể, sinh lực, chức năng xã hội, vai trò cảm xúc, sức khỏe tâm thần.",
        "content": [
            {
                "id": "1",
                "question": "Sức khỏe tổng thể của bạn hiện tại như thế nào?",
                "type": "dropdown",
                "criteria": "general_health",
                "options": [
                    {"text": "Xuất sắc", "score": 5},
                    {"text": "Rất tốt", "score": 4},
                    {"text": "Tốt", "score": 3},
                    {"text": "Khá", "score": 2},
                    {"text": "Kém", "score": 1}
                ]
            },
            {
                "id": "2",
                "question": "So với một năm trước, bạn đánh giá sức khỏe của mình hiện tại như thế nào?",
                "type": "dropdown",
                "criteria": "general_health",
                "options": [
                    {"text": "Tốt hơn nhiều", "score": 5},
                    {"text": "Tốt hơn một chút", "score": 4},
                    {"text": "Giống nhau", "score": 3},
                    {"text": "Kém hơn một chút", "score": 2},
                    {"text": "Kém hơn nhiều", "score": 1}
                ]
            },
            {
                "id": "3",
                "question": "Các hoạt động thể chất sau đây bị hạn chế do sức khỏe của bạn:",
                "type": "multiple_choice_grid",
                "criteria": "physical_function",
                "rows": [
                    {"text": "Hoạt động thể chất mạnh (chạy, nâng vật nặng, thể thao)"},
                    {"text": "Hoạt động thể chất vừa (di chuyển bàn, hút bụi, đi bộ)"},
                    {"text": "Nâng hoặc mang đồ vật"},
                    {"text": "Leo nhiều tầng cầu thang"},
                    {"text": "Leo một tầng cầu thang"},
                    {"text": "Cúi, quỳ, hoặc cúi người"},
                    {"text": "Đi bộ hơn một km"},
                    {"text": "Đi bộ vài trăm mét"},
                    {"text": "Đi bộ một trăm mét"},
                    {"text": "Tắm hoặc mặc quần áo"}
                ],
                "columns": [
                    {"text": "Có, bị hạn chế nhiều", "score": 1},
                    {"text": "Có, bị hạn chế một chút", "score": 2},
                    {"text": "Không, không bị hạn chế", "score": 3}
                ]
            },
            {
                "id": "4",
                "question": "Trong 4 tuần qua, sức khỏe thể chất của bạn đã hạn chế bạn trong các hoạt động sau:",
                "type": "checkbox_grid",
                "criteria": "role_physical",
                "rows": [
                    {"text": "Giảm thời gian làm việc hoặc các hoạt động khác"},
                    {"text": "Hoàn thành ít việc hơn bạn muốn"},
                    {"text": "Bị hạn chế trong loại công việc hoặc hoạt động"},
                    {"text": "Gặp khó khăn khi thực hiện công việc hoặc hoạt động"}
                ],
                "columns": [
                    {"text": "Có", "score": 0},
                    {"text": "Không", "score": 1}
                ]
            },
            {
                "id": "5",
                "question": "Trong 4 tuần qua, các vấn đề cảm xúc đã hạn chế bạn trong các hoạt động sau:",
                "type": "checkbox_grid",
                "criteria": "role_emotional",
                "rows": [
                    {"text": "Giảm thời gian làm việc hoặc các hoạt động khác"},
                    {"text": "Hoàn thành ít việc hơn bạn muốn"},
                    {"text": "Không làm việc cẩn thận như bình thường"}
                ],
                "columns": [
                    {"text": "Có", "score": 0},
                    {"text": "Không", "score": 1}
                ]
            },
            {
                "id": "6",
                "question": "Trong 4 tuần qua, đau cơ thể đã ảnh hưởng đến công việc bình thường của bạn (bao gồm cả công việc bên ngoài và công việc nhà) như thế nào?",
                "type": "linear_scale",
                "criteria": "bodily_pain",
                "min": 1,
                "max": 6,
                "labels": {
                    "1": "Không ảnh hưởng",
                    "2": "Ảnh hưởng rất ít",
                    "3": "Ảnh hưởng một chút",
                    "4": "Ảnh hưởng vừa",
                    "5": "Ảnh hưởng nhiều",
                    "6": "Ảnh hưởng rất nhiều"
                }
            },
            {
                "id": "7",
                "question": "Trong 4 tuần qua, bạn cảm thấy tràn đầy năng lượng như thế nào?",
                "type": "linear_scale",
                "criteria": "vitality",
                "min": 1,
                "max": 6,
                "labels": {
                    "1": "Luôn luôn",
                    "2": "Hầu hết thời gian",
                    "3": "Khá thường xuyên",
                    "4": "Đôi khi",
                    "5": "Hiếm khi",
                    "6": "Không bao giờ"
                }
            },
            {
                "id": "8",
                "question": "Trong 4 tuần qua, sức khỏe thể chất hoặc cảm xúc của bạn đã cản trở các hoạt động xã hội của bạn (thăm bạn bè, người thân, v.v.) như thế nào?",
                "type": "linear_scale",
                "criteria": "social_function",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Tất cả thời gian",
                    "2": "Hầu hết thời gian",
                    "3": "Một số thời gian",
                    "4": "Một chút thời gian",
                    "5": "Không bao giờ"
                }
            },
            {
                "id": "9",
                "question": "Trong 4 tuần qua, bạn cảm thấy bình tĩnh và yên bình như thế nào?",
                "type": "linear_scale",
                "criteria": "mental_health",
                "min": 1,
                "max": 6,
                "labels": {
                    "1": "Luôn luôn",
                    "2": "Hầu hết thời gian",
                    "3": "Khá thường xuyên",
                    "4": "Đôi khi",
                    "5": "Hiếm khi",
                    "6": "Không bao giờ"
                }
            },
            {
                "id": "10",
                "question": "Trong 4 tuần qua, bạn cảm thấy chán nản và buồn bã như thế nào?",
                "type": "linear_scale",
                "criteria": "mental_health",
                "min": 1,
                "max": 6,
                "labels": {
                    "1": "Luôn luôn",
                    "2": "Hầu hết thời gian",
                    "3": "Khá thường xuyên",
                    "4": "Đôi khi",
                    "5": "Hiếm khi",
                    "6": "Không bao giờ"
                }
            }
        ]
    },
    {
        "name": "PSS - Perceived Stress Scale",
        "description": "Thang đánh giá căng thẳng cảm nhận. Đo lường mức độ mà các tình huống trong cuộc sống được đánh giá là căng thẳng.",
        "content": [
            {
                "id": "1",
                "question": "Trong tháng qua, bạn cảm thấy khó khăn như thế nào khi phải đối phó với những điều quan trọng xảy ra trong cuộc sống của bạn?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hầu như không bao giờ",
                    "2": "Đôi khi",
                    "3": "Khá thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "2",
                "question": "Trong tháng qua, bạn cảm thấy tự tin về khả năng xử lý các vấn đề cá nhân của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất thường xuyên",
                    "1": "Khá thường xuyên",
                    "2": "Đôi khi",
                    "3": "Hầu như không bao giờ",
                    "4": "Không bao giờ"
                }
            },
            {
                "id": "3",
                "question": "Trong tháng qua, bạn cảm thấy mọi thứ đang diễn ra theo cách của bạn như thế nào?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất thường xuyên",
                    "1": "Khá thường xuyên",
                    "2": "Đôi khi",
                    "3": "Hầu như không bao giờ",
                    "4": "Không bao giờ"
                }
            },
            {
                "id": "4",
                "question": "Trong tháng qua, bạn cảm thấy có thể kiểm soát các điều khó chịu trong cuộc sống của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất thường xuyên",
                    "1": "Khá thường xuyên",
                    "2": "Đôi khi",
                    "3": "Hầu như không bao giờ",
                    "4": "Không bao giờ"
                }
            },
            {
                "id": "5",
                "question": "Trong tháng qua, bạn cảm thấy bạn đang ở trên đỉnh của mọi thứ như thế nào?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất thường xuyên",
                    "1": "Khá thường xuyên",
                    "2": "Đôi khi",
                    "3": "Hầu như không bao giờ",
                    "4": "Không bao giờ"
                }
            },
            {
                "id": "6",
                "question": "Trong tháng qua, bạn cảm thấy khó khăn như thế nào khi tích lũy các điều khó chịu mà bạn không thể xử lý?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hầu như không bao giờ",
                    "2": "Đôi khi",
                    "3": "Khá thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "7",
                "question": "Trong tháng qua, bạn cảm thấy có thể kiểm soát cách bạn dành thời gian của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất thường xuyên",
                    "1": "Khá thường xuyên",
                    "2": "Đôi khi",
                    "3": "Hầu như không bao giờ",
                    "4": "Không bao giờ"
                }
            },
            {
                "id": "8",
                "question": "Trong tháng qua, bạn cảm thấy khó khăn như thế nào khi phải đối phó với những điều không thể tránh khỏi?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hầu như không bao giờ",
                    "2": "Đôi khi",
                    "3": "Khá thường xuyên",
                    "4": "Rất thường xuyên"
                }
            },
            {
                "id": "9",
                "question": "Trong tháng qua, bạn cảm thấy có thể kiểm soát các vấn đề trong cuộc sống của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất thường xuyên",
                    "1": "Khá thường xuyên",
                    "2": "Đôi khi",
                    "3": "Hầu như không bao giờ",
                    "4": "Không bao giờ"
                }
            },
            {
                "id": "10",
                "question": "Trong tháng qua, bạn cảm thấy khó khăn như thế nào khi phải đối phó với tất cả những điều bạn phải làm?",
                "type": "linear_scale",
                "criteria": "stress",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không bao giờ",
                    "1": "Hầu như không bao giờ",
                    "2": "Đôi khi",
                    "3": "Khá thường xuyên",
                    "4": "Rất thường xuyên"
                }
            }
        ]
    },
    {
        "name": "Denver II - Denver Developmental Screening Test",
        "description": "Test sàng lọc phát triển Denver II, đánh giá sự phát triển của trẻ em từ sơ sinh đến 6 tuổi. Bao gồm 4 lĩnh vực: Cá nhân-Xã hội, Vận động tinh, Ngôn ngữ, Vận động thô.",
        "content": [
            {
                "id": "1",
                "question": "Ngày sinh của trẻ",
                "type": "date",
                "criteria": "demographic",
                "required": True
            },
            {
                "id": "2",
                "question": "Giới tính của trẻ",
                "type": "dropdown",
                "criteria": "demographic",
                "options": [
                    {"text": "Nam", "score": 0},
                    {"text": "Nữ", "score": 0}
                ]
            },
            {
                "id": "3",
                "question": "Cá nhân - Xã hội: Trẻ có cười đáp lại không?",
                "type": "multiple_choice",
                "criteria": "personal_social",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "4",
                "question": "Cá nhân - Xã hội: Trẻ có nhận biết người lạ không?",
                "type": "multiple_choice",
                "criteria": "personal_social",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "5",
                "question": "Cá nhân - Xã hội: Trẻ có tự ăn bằng thìa không?",
                "type": "multiple_choice",
                "criteria": "personal_social",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "6",
                "question": "Vận động tinh: Trẻ có nắm được đồ vật không?",
                "type": "multiple_choice",
                "criteria": "fine_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "7",
                "question": "Vận động tinh: Trẻ có chỉ được bằng ngón trỏ không?",
                "type": "multiple_choice",
                "criteria": "fine_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "8",
                "question": "Vận động tinh: Trẻ có vẽ được đường thẳng không?",
                "type": "multiple_choice",
                "criteria": "fine_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "9",
                "question": "Ngôn ngữ: Trẻ có phát ra âm thanh không?",
                "type": "multiple_choice",
                "criteria": "language",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "10",
                "question": "Ngôn ngữ: Trẻ có nói được từ đơn không?",
                "type": "multiple_choice",
                "criteria": "language",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "11",
                "question": "Ngôn ngữ: Trẻ có nói được câu 2 từ không?",
                "type": "multiple_choice",
                "criteria": "language",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "12",
                "question": "Vận động thô: Trẻ có ngồi được không cần hỗ trợ không?",
                "type": "multiple_choice",
                "criteria": "gross_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "13",
                "question": "Vận động thô: Trẻ có đứng được không?",
                "type": "multiple_choice",
                "criteria": "gross_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "14",
                "question": "Vận động thô: Trẻ có đi được không?",
                "type": "multiple_choice",
                "criteria": "gross_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            },
            {
                "id": "15",
                "question": "Vận động thô: Trẻ có chạy được không?",
                "type": "multiple_choice",
                "criteria": "gross_motor",
                "options": [
                    {"text": "Có", "score": 1},
                    {"text": "Không", "score": 0},
                    {"text": "Không rõ", "score": 0}
                ]
            }
        ]
    },
    {
        "name": "ISI - Insomnia Severity Index",
        "description": "Chỉ số mức độ nghiêm trọng của mất ngủ. Đánh giá các khía cạnh của mất ngủ: khó ngủ, duy trì giấc ngủ, thức dậy sớm, sự hài lòng với giấc ngủ, ảnh hưởng đến cuộc sống.",
        "content": [
            {
                "id": "1",
                "question": "Trong 2 tuần qua, bạn đánh giá mức độ khó khăn khi đi vào giấc ngủ như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không có",
                    "1": "Nhẹ",
                    "2": "Vừa",
                    "3": "Nặng",
                    "4": "Rất nặng"
                }
            },
            {
                "id": "2",
                "question": "Trong 2 tuần qua, bạn đánh giá mức độ khó khăn khi duy trì giấc ngủ như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không có",
                    "1": "Nhẹ",
                    "2": "Vừa",
                    "3": "Nặng",
                    "4": "Rất nặng"
                }
            },
            {
                "id": "3",
                "question": "Trong 2 tuần qua, bạn đánh giá mức độ khó khăn khi thức dậy sớm như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không có",
                    "1": "Nhẹ",
                    "2": "Vừa",
                    "3": "Nặng",
                    "4": "Rất nặng"
                }
            },
            {
                "id": "4",
                "question": "Trong 2 tuần qua, bạn hài lòng/không hài lòng với mô hình giấc ngủ hiện tại của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Rất hài lòng",
                    "1": "Hài lòng",
                    "2": "Vừa",
                    "3": "Không hài lòng",
                    "4": "Rất không hài lòng"
                }
            },
            {
                "id": "5",
                "question": "Trong 2 tuần qua, bạn đánh giá mức độ mà vấn đề giấc ngủ của bạn ảnh hưởng đến chất lượng cuộc sống hàng ngày như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không ảnh hưởng",
                    "1": "Ảnh hưởng nhẹ",
                    "2": "Ảnh hưởng vừa",
                    "3": "Ảnh hưởng nhiều",
                    "4": "Ảnh hưởng rất nhiều"
                }
            },
            {
                "id": "6",
                "question": "Trong 2 tuần qua, bạn đánh giá mức độ mà vấn đề giấc ngủ của bạn ảnh hưởng đến khả năng hoạt động ban ngày (năng suất, khả năng tập trung, trí nhớ, tâm trạng) như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không ảnh hưởng",
                    "1": "Ảnh hưởng nhẹ",
                    "2": "Ảnh hưởng vừa",
                    "3": "Ảnh hưởng nhiều",
                    "4": "Ảnh hưởng rất nhiều"
                }
            },
            {
                "id": "7",
                "question": "Trong 2 tuần qua, bạn đánh giá mức độ lo lắng/khó chịu về vấn đề giấc ngủ hiện tại của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "insomnia",
                "min": 0,
                "max": 4,
                "labels": {
                    "0": "Không lo lắng",
                    "1": "Lo lắng nhẹ",
                    "2": "Lo lắng vừa",
                    "3": "Lo lắng nhiều",
                    "4": "Lo lắng rất nhiều"
                }
            }
        ]
    },
    {
        "name": "AUDIT - Alcohol Use Disorders Identification Test",
        "description": "Test xác định rối loạn sử dụng rượu. Đánh giá mức độ sử dụng rượu, các triệu chứng phụ thuộc và hậu quả liên quan đến rượu.",
        "content": [
            {
                "id": "1",
                "question": "Bạn uống rượu bao lâu một lần?",
                "type": "dropdown",
                "criteria": "alcohol_use",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Một tháng một lần hoặc ít hơn", "score": 1},
                    {"text": "2-4 lần một tháng", "score": 2},
                    {"text": "2-3 lần một tuần", "score": 3},
                    {"text": "4 lần trở lên một tuần", "score": 4}
                ]
            },
            {
                "id": "2",
                "question": "Vào một ngày điển hình khi bạn uống rượu, bạn uống bao nhiêu đơn vị đồ uống có cồn?",
                "type": "short_answer",
                "criteria": "alcohol_use",
                "required": True
            },
            {
                "id": "3",
                "question": "Bạn uống 6 đơn vị trở lên trong một lần uống bao lâu một lần?",
                "type": "dropdown",
                "criteria": "alcohol_use",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Ít hơn một tháng một lần", "score": 1},
                    {"text": "Một tháng một lần", "score": 2},
                    {"text": "Một tuần một lần", "score": 3},
                    {"text": "Hàng ngày hoặc gần như hàng ngày", "score": 4}
                ]
            },
            {
                "id": "4",
                "question": "Trong năm qua, bạn có bao giờ thấy mình không thể ngừng uống một khi đã bắt đầu không?",
                "type": "multiple_choice",
                "criteria": "alcohol_dependence",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Ít hơn một tháng một lần", "score": 1},
                    {"text": "Một tháng một lần", "score": 2},
                    {"text": "Một tuần một lần", "score": 3},
                    {"text": "Hàng ngày hoặc gần như hàng ngày", "score": 4}
                ]
            },
            {
                "id": "5",
                "question": "Trong năm qua, bạn có bao giờ không thể làm được những gì bạn mong đợi vì uống rượu không?",
                "type": "multiple_choice",
                "criteria": "alcohol_dependence",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Ít hơn một tháng một lần", "score": 1},
                    {"text": "Một tháng một lần", "score": 2},
                    {"text": "Một tuần một lần", "score": 3},
                    {"text": "Hàng ngày hoặc gần như hàng ngày", "score": 4}
                ]
            },
            {
                "id": "6",
                "question": "Trong năm qua, bạn có bao giờ cần uống rượu vào buổi sáng để bắt đầu ngày mới sau một đêm uống nhiều không?",
                "type": "multiple_choice",
                "criteria": "alcohol_dependence",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Ít hơn một tháng một lần", "score": 1},
                    {"text": "Một tháng một lần", "score": 2},
                    {"text": "Một tuần một lần", "score": 3},
                    {"text": "Hàng ngày hoặc gần như hàng ngày", "score": 4}
                ]
            },
            {
                "id": "7",
                "question": "Trong năm qua, bạn có bao giờ cảm thấy tội lỗi hoặc hối hận sau khi uống rượu không?",
                "type": "multiple_choice",
                "criteria": "alcohol_consequences",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Ít hơn một tháng một lần", "score": 1},
                    {"text": "Một tháng một lần", "score": 2},
                    {"text": "Một tuần một lần", "score": 3},
                    {"text": "Hàng ngày hoặc gần như hàng ngày", "score": 4}
                ]
            },
            {
                "id": "8",
                "question": "Trong năm qua, bạn có bao giờ không thể nhớ những gì đã xảy ra đêm trước vì uống rượu không?",
                "type": "multiple_choice",
                "criteria": "alcohol_consequences",
                "options": [
                    {"text": "Không bao giờ", "score": 0},
                    {"text": "Ít hơn một tháng một lần", "score": 1},
                    {"text": "Một tháng một lần", "score": 2},
                    {"text": "Một tuần một lần", "score": 3},
                    {"text": "Hàng ngày hoặc gần như hàng ngày", "score": 4}
                ]
            },
            {
                "id": "9",
                "question": "Bạn hoặc người khác có bị thương vì bạn uống rượu không?",
                "type": "multiple_choice",
                "criteria": "alcohol_consequences",
                "options": [
                    {"text": "Không", "score": 0},
                    {"text": "Có, nhưng không phải trong năm qua", "score": 2},
                    {"text": "Có, trong năm qua", "score": 4}
                ]
            },
            {
                "id": "10",
                "question": "Bạn bè, người thân, bác sĩ hoặc nhân viên y tế khác có quan tâm về việc uống rượu của bạn hoặc đề nghị bạn cắt giảm không?",
                "type": "multiple_choice",
                "criteria": "alcohol_consequences",
                "options": [
                    {"text": "Không", "score": 0},
                    {"text": "Có, nhưng không phải trong năm qua", "score": 2},
                    {"text": "Có, trong năm qua", "score": 4}
                ]
            }
        ]
    },
    {
        "name": "WHOQOL-BREF - Chất lượng cuộc sống WHO",
        "description": "Bảng câu hỏi chất lượng cuộc sống của WHO (phiên bản ngắn). Đánh giá chất lượng cuộc sống trong 4 lĩnh vực: Sức khỏe thể chất, Tâm lý, Quan hệ xã hội, Môi trường.",
        "content": [
            {
                "id": "1",
                "question": "Bạn đánh giá chất lượng cuộc sống của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "quality_of_life",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất kém",
                    "2": "Kém",
                    "3": "Vừa",
                    "4": "Tốt",
                    "5": "Rất tốt"
                }
            },
            {
                "id": "2",
                "question": "Bạn hài lòng với sức khỏe của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "quality_of_life",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "3",
                "question": "Bạn cảm thấy đau đớn cản trở bạn làm những việc bạn cần làm như thế nào?",
                "type": "linear_scale",
                "criteria": "physical_health",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Không có",
                    "2": "Một chút",
                    "3": "Vừa",
                    "4": "Nhiều",
                    "5": "Rất nhiều"
                }
            },
            {
                "id": "4",
                "question": "Bạn cần bao nhiêu sự hỗ trợ y tế trong cuộc sống hàng ngày?",
                "type": "linear_scale",
                "criteria": "physical_health",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Không có",
                    "2": "Một chút",
                    "3": "Vừa",
                    "4": "Nhiều",
                    "5": "Rất nhiều"
                }
            },
            {
                "id": "5",
                "question": "Bạn tận hưởng cuộc sống như thế nào?",
                "type": "linear_scale",
                "criteria": "psychological",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Không có",
                    "2": "Một chút",
                    "3": "Vừa",
                    "4": "Nhiều",
                    "5": "Rất nhiều"
                }
            },
            {
                "id": "6",
                "question": "Bạn cảm thấy cuộc sống của mình có ý nghĩa như thế nào?",
                "type": "linear_scale",
                "criteria": "psychological",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Không có",
                    "2": "Một chút",
                    "3": "Vừa",
                    "4": "Nhiều",
                    "5": "Rất nhiều"
                }
            },
            {
                "id": "7",
                "question": "Bạn có thể tập trung như thế nào?",
                "type": "linear_scale",
                "criteria": "psychological",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất kém",
                    "2": "Kém",
                    "3": "Vừa",
                    "4": "Tốt",
                    "5": "Rất tốt"
                }
            },
            {
                "id": "8",
                "question": "Bạn cảm thấy an toàn trong cuộc sống hàng ngày của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không an toàn",
                    "2": "Không an toàn",
                    "3": "Vừa",
                    "4": "An toàn",
                    "5": "Rất an toàn"
                }
            },
            {
                "id": "9",
                "question": "Môi trường sống của bạn (không khí, tiếng ồn, thời tiết) tốt như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất kém",
                    "2": "Kém",
                    "3": "Vừa",
                    "4": "Tốt",
                    "5": "Rất tốt"
                }
            },
            {
                "id": "10",
                "question": "Bạn có đủ tiền để đáp ứng nhu cầu của mình không?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Hoàn toàn không đủ",
                    "2": "Không đủ",
                    "3": "Vừa",
                    "4": "Đủ",
                    "5": "Hoàn toàn đủ"
                }
            },
            {
                "id": "11",
                "question": "Bạn có thể tiếp cận thông tin bạn cần trong cuộc sống hàng ngày như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất kém",
                    "2": "Kém",
                    "3": "Vừa",
                    "4": "Tốt",
                    "5": "Rất tốt"
                }
            },
            {
                "id": "12",
                "question": "Bạn có cơ hội tham gia các hoạt động giải trí như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất kém",
                    "2": "Kém",
                    "3": "Vừa",
                    "4": "Tốt",
                    "5": "Rất tốt"
                }
            },
            {
                "id": "13",
                "question": "Bạn có thể đi lại như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất kém",
                    "2": "Kém",
                    "3": "Vừa",
                    "4": "Tốt",
                    "5": "Rất tốt"
                }
            },
            {
                "id": "14",
                "question": "Bạn hài lòng với giấc ngủ của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "physical_health",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "15",
                "question": "Bạn hài lòng với khả năng thực hiện các hoạt động hàng ngày của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "physical_health",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "16",
                "question": "Bạn hài lòng với khả năng làm việc của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "physical_health",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "17",
                "question": "Bạn hài lòng với bản thân như thế nào?",
                "type": "linear_scale",
                "criteria": "psychological",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "18",
                "question": "Bạn hài lòng với các mối quan hệ cá nhân của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "social",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "19",
                "question": "Bạn hài lòng với đời sống tình dục của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "social",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "20",
                "question": "Bạn hài lòng với sự hỗ trợ bạn nhận được từ bạn bè như thế nào?",
                "type": "linear_scale",
                "criteria": "social",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "21",
                "question": "Bạn hài lòng với điều kiện nơi bạn sống như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "22",
                "question": "Bạn hài lòng với khả năng tiếp cận các dịch vụ y tế như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "23",
                "question": "Bạn hài lòng với phương tiện giao thông như thế nào?",
                "type": "linear_scale",
                "criteria": "environment",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            },
            {
                "id": "24",
                "question": "Bạn cảm thấy tiêu cực (như buồn bã, lo lắng, chán nản) như thế nào?",
                "type": "linear_scale",
                "criteria": "psychological",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Không có",
                    "2": "Một chút",
                    "3": "Vừa",
                    "4": "Nhiều",
                    "5": "Rất nhiều"
                }
            },
            {
                "id": "25",
                "question": "Bạn cảm thấy tích cực như thế nào?",
                "type": "linear_scale",
                "criteria": "psychological",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Không có",
                    "2": "Một chút",
                    "3": "Vừa",
                    "4": "Nhiều",
                    "5": "Rất nhiều"
                }
            },
            {
                "id": "26",
                "question": "Bạn hài lòng với khả năng di chuyển của mình như thế nào?",
                "type": "linear_scale",
                "criteria": "physical_health",
                "min": 1,
                "max": 5,
                "labels": {
                    "1": "Rất không hài lòng",
                    "2": "Không hài lòng",
                    "3": "Vừa",
                    "4": "Hài lòng",
                    "5": "Rất hài lòng"
                }
            }
        ]
    }
]

def create_survey_templates():
    """Tạo các mẫu khảo sát tâm lý vào database"""
    db = next(get_db())
    
    try:
        # Lấy user đầu tiên làm created_by
        user = db.query(User).first()
        if not user:
            print("❌ Không tìm thấy user nào trong database")
            return
        
        created_count = 0
        skipped_count = 0
        
        for template_data in SURVEY_TEMPLATES:
            # Kiểm tra xem template đã tồn tại chưa
            existing = db.query(SurveyTemplate).filter(
                SurveyTemplate.name == template_data["name"]
            ).first()
            
            if existing:
                print(f"⏭️  Đã tồn tại: {template_data['name']}")
                skipped_count += 1
                continue
            
            # Tạo template mới
            template = SurveyTemplate(
                name=template_data["name"],
                description=template_data["description"],
                content=template_data["content"],
                created_by=user.id,
                is_active=True
            )
            
            db.add(template)
            print(f"✅ Đã tạo: {template_data['name']}")
            created_count += 1
        
        db.commit()
        print(f"\n📊 Kết quả:")
        print(f"   - Đã tạo: {created_count} mẫu")
        print(f"   - Đã bỏ qua: {skipped_count} mẫu (đã tồn tại)")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Lỗi: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    print("🚀 Bắt đầu tạo các mẫu khảo sát tâm lý...\n")
    create_survey_templates()
    print("\n✨ Hoàn thành!")

