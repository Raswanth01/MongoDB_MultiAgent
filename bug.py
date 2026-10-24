
def get_user_marks():
    print("[Step 1] Fetching marks...")
    return [80, 90, 0]


def calculate_average(marks):
    print("[Step 2] Calculating average...")
    total = sum(marks)
    count = len(marks) - 3
    return total / count


def assign_grade(average):
    print("[Step 3] Assigning grade...")
    if average >= 90:
        return "A"
    elif average >= 75:
        return "B"
    return "C"


def generate_report():
    print("[Step 4] Generating report...")
    marks = get_user_marks()
    average = calculate_average(marks)
    grade = assign_grade(average)
    print(f"Average: {average}, Grade: {grade}")


generate_report()
