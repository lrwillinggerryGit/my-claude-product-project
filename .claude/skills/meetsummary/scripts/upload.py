# -*- coding: utf-8 -*-
"""
upload.py - 会议纪要服务器同步模拟脚本
调用方式: python upload.py "会议纪要内容"
"""

from __future__ import print_function, unicode_literals
import sys
import json
import time
from datetime import datetime

reload(sys)
sys.setdefaultencoding('utf-8')

# ────────────────────────────────────────────
# 财务关键词配置（来源：公司财务手册.md）
# ────────────────────────────────────────────
FINANCE_KEYWORDS = ["资金", "成本", "采购", "开支", "预算", "报销", "费用", "金额"]

FINANCE_RULES = {
    "IT采购": {
        "普通办公设备": {"上限": 10000, "审批人": "部门负责人（Director）"},
        "专业工作站":   {"上限": 20000, "审批人": "部门负责人（Director）"},
        "定制化高端设备": {"上限": float("inf"), "审批人": "IT负责人初审 + 财务总监（CFO）签字"},
        "招标门槛":     {"上限": 50000, "审批人": "至少三家供应商竞标"},
    },
    "出差住宿": {
        "一线城市（北京/上海/广州/深圳）": {"上限": 800},
        "新一线与二线城市":               {"上限": 500},
        "三线及以下城市":                 {"上限": 350},
    },
    "商务宴请": {
        "人均标准":     {"上限": 300, "审批人": "业务副总裁（VP）特别审批（高消费城市可至500元/人）"},
    },
    "日常报销": {
        "自主报销":     {"上限": 500,  "审批人": "员工自行提交"},
        "上级审批":     {"上限": 5000, "审批人": "直属上级在财务系统审核"},
    },
    "营销活动": {
        "赠品采购":     {"上限": 300,  "审批人": "提前14个工作日走OA审批流程"},
    },
}


# ────────────────────────────────────────────
# 核心功能
# ────────────────────────────────────────────

def check_finance_keywords(content):
    return [kw for kw in FINANCE_KEYWORDS if kw in content]


def generate_finance_warning(keywords):
    warning_lines = [
        u"⚠️  【财务提醒】检测到以下财务关键词：" + u"、".join(keywords),
        u"",
        u"请对照《公司财务手册》相关规范进行审核：",
    ]
    for category, rules in FINANCE_RULES.items():
        warning_lines.append(u"\n  📌 %s：" % category)
        for item, detail in rules.items():
            limit = detail[u"上限"]
            approver = detail.get(u"审批人", u"—")
            limit_str = u"%s 元" % "{:,}".format(int(limit)) if limit != float("inf") else u"无上限"
            warning_lines.append(u"     · %s：上限 %s，审批人：%s" % (item, limit_str, approver))
    warning_lines.append(u"\n  ⚡ 未经特别批准超出标准的申请，财务部门将不予受理。")
    return u"\n".join(warning_lines)


def format_summary(content):
    return {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source": u"会议总结助手 (meeting-skill)",
        "content": content,
        "version": "1.0",
    }


def simulate_upload(payload):
    print(u"\n🔄 正在连接服务器...")
    time.sleep(0.5)
    print(u"📦 正在打包会议纪要数据...")
    time.sleep(0.5)
    print(u"⬆️  正在上传...")
    time.sleep(0.8)
    print(u"✅ 上传成功！")
    print(u"   服务器返回：{ \"status\": \"ok\", \"record_id\": \"MTG-%d\" }" % int(time.time()))
    return True


# ────────────────────────────────────────────
# 主流程
# ────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(u"❌ 用法错误。正确调用方式：")
        print(u"   python upload.py \"会议纪要内容\"")
        sys.exit(1)

    content = sys.argv[1].decode('mbcs') if isinstance(sys.argv[1], bytes) else sys.argv[1]

    print(u"=" * 60)
    print(u"       会议总结助手 · 文档同步服务 (upload.py)")
    print(u"=" * 60)
    print(u"\n📄 接收到会议纪要（共 %d 字）：" % len(content))
    suffix = u"..." if len(content) > 80 else u""
    print(u"   %s%s" % (content[:80], suffix))

    print(u"\n🔍 正在进行财务关键词扫描...")
    matched_keywords = check_finance_keywords(content)

    if matched_keywords:
        warning = generate_finance_warning(matched_keywords)
        print(warning)
    else:
        print(u"   ✅ 未检测到财务关键词，无需财务提醒。")

    print(u"\n📝 正在格式化会议纪要...")
    payload = format_summary(content)
    print(u"   时间戳：%s" % payload['timestamp'])
    print(u"   来源：%s" % payload['source'])

    simulate_upload(payload)

    print(u"\n" + u"=" * 60)
    print(u"   同步完成。会议纪要已成功推送至服务器。")
    print(u"=" * 60)


if __name__ == "__main__":
    main()
