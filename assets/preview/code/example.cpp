#include <iostream>
#include <cstdlib>
#include <ctime>

int main() {
  std::srand(std::time(0));
  for (int i = 10; i > 0; --i) {
    int randNum = std::rand() % 10 + 1 + i;
    std::cout << "Number: " << randNum << std::endl;
  }
  return 0;
}
