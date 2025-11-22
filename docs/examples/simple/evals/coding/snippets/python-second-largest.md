```python
from typing import List, Union

def find_second_largest(numbers: List[int]) -> Union[int, None]:
    """
    Find the second largest number in a list of integers.
    
    Args:
        numbers: List of integers to search
        
    Returns:
        The second largest unique number, or None if not available
        
    Raises:
        TypeError: If input is not a list or contains non-integers
        ValueError: If list is empty
    """
    if not isinstance(numbers, list):
        raise TypeError("Input must be a list")
    
    if not numbers:
        raise ValueError("List cannot be empty")
    
    if not all(isinstance(x, int) for x in numbers):
        raise TypeError("All elements must be integers")
    
    unique_numbers = list(set(numbers))
    
    if len(unique_numbers) < 2:
        return None
    
    unique_numbers.sort(reverse=True)
    return unique_numbers[1]
```
