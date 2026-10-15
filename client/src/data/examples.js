// src/data/examples.js
// Pre-built C++ example programs for students to explore

export const examplePrograms = [
  {
    id: 'hello-world',
    title: 'Hello World',
    category: 'Basics',
    description: 'The classic first C++ program',
    code: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
  },
  {
    id: 'variables',
    title: 'Variables & Arithmetic',
    category: 'Basics',
    description: 'Variable declaration, initialization, and arithmetic operations',
    code: `#include <iostream>
using namespace std;

int main() {
    int a = 10;
    int b = 25;
    int sum = a + b;
    int diff = b - a;
    int product = a * b;
    double ratio = (double)b / a;

    cout << "Sum: " << sum << endl;
    cout << "Difference: " << diff << endl;
    cout << "Product: " << product << endl;

    return 0;
}`,
  },
  {
    id: 'if-else',
    title: 'If-Else Branching',
    category: 'Control Flow',
    description: 'Conditional branching with if, else if, and else',
    code: `#include <iostream>
using namespace std;

int main() {
    int score = 85;

    if (score >= 90) {
        cout << "Grade: A" << endl;
    } else if (score >= 80) {
        cout << "Grade: B" << endl;
    } else if (score >= 70) {
        cout << "Grade: C" << endl;
    } else {
        cout << "Grade: F" << endl;
    }

    return 0;
}`,
  },
  {
    id: 'for-loop',
    title: 'For Loop',
    category: 'Loops',
    description: 'Iterating with a for loop and accumulating a sum',
    code: `#include <iostream>
using namespace std;

int main() {
    int sum = 0;

    for (int i = 1; i <= 5; i++) {
        sum = sum + i;
        cout << "i=" << i << " sum=" << sum << endl;
    }

    cout << "Total: " << sum << endl;
    return 0;
}`,
  },
  {
    id: 'while-loop',
    title: 'While Loop',
    category: 'Loops',
    description: 'A while loop that counts down',
    code: `#include <iostream>
using namespace std;

int main() {
    int count = 5;

    while (count > 0) {
        cout << "Countdown: " << count << endl;
        count--;
    }

    cout << "Liftoff!" << endl;
    return 0;
}`,
  },
  {
    id: 'functions',
    title: 'Functions',
    category: 'Functions',
    description: 'Defining and calling functions with parameters',
    code: `#include <iostream>
using namespace std;

int add(int x, int y) {
    int result = x + y;
    return result;
}

int multiply(int x, int y) {
    int result = x * y;
    return result;
}

int main() {
    int a = 5;
    int b = 3;
    int sum = add(a, b);
    int prod = multiply(a, b);

    cout << "Sum: " << sum << endl;
    cout << "Product: " << prod << endl;

    return 0;
}`,
  },
  {
    id: 'recursion-factorial',
    title: 'Recursion — Factorial',
    category: 'Recursion',
    description: 'Classic factorial using recursion. Watch the call stack grow and unwind.',
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    int result = n * factorial(n - 1);
    return result;
}

int main() {
    int num = 5;
    int result = factorial(num);
    cout << num << "! = " << result << endl;
    return 0;
}`,
  },
  {
    id: 'recursion-fibonacci',
    title: 'Recursion — Fibonacci',
    category: 'Recursion',
    description: 'Fibonacci sequence using recursion. See the tree of recursive calls.',
    code: `#include <iostream>
using namespace std;

int fibonacci(int n) {
    if (n <= 0) {
        return 0;
    }
    if (n == 1) {
        return 1;
    }
    int result = fibonacci(n - 1) + fibonacci(n - 2);
    return result;
}

int main() {
    int n = 6;
    int result = fibonacci(n);
    cout << "fib(" << n << ") = " << result << endl;
    return 0;
}`,
  },
  {
    id: 'arrays',
    title: 'Arrays',
    category: 'Data Structures',
    description: 'Array declaration, initialization, and traversal',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[5] = {10, 20, 30, 40, 50};
    int sum = 0;

    for (int i = 0; i < 5; i++) {
        sum = sum + arr[i];
        cout << "arr[" << i << "] = " << arr[i] << endl;
    }

    cout << "Total: " << sum << endl;
    return 0;
}`,
  },
  {
    id: 'bubble-sort',
    title: 'Bubble Sort',
    category: 'Algorithms',
    description: 'Classic bubble sort algorithm. Watch how elements swap.',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[5] = {64, 25, 12, 22, 11};
    int n = 5;

    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }

    cout << "Sorted: ";
    for (int i = 0; i < n; i++) {
        cout << arr[i] << " ";
    }

    return 0;
}`,
  },
];

export const categories = [...new Set(examplePrograms.map(p => p.category))];

export function getExampleByID(id) {
  return examplePrograms.find(p => p.id === id) || null;
}
