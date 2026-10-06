import java.util.Random;

public class Example {
  public static void main(String[] args) {
    Random random = new Random();
    for (int i = 10; i > 0; --i) {
      int randNum = random.nextInt(10) + 1 + i;
      System.out.println("Number: " + randNum);
    }
  }
}
