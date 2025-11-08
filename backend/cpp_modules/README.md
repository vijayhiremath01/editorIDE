# C++ Integration Modules

This directory contains C++ modules for high-performance video operations.

## Setup

### Requirements
- CMake >= 3.15
- pybind11
- C++17 compiler
- FFmpeg development libraries

### Building

```bash
mkdir build
cd build
cmake ..
make
```

### Integration with Python

The C++ modules are exposed to Python via pybind11:

```python
import clipengine

# Calculate precise frame positions
frame = clipengine.get_frame_at_time(video_path, timestamp, fps)

# Efficient timeline calculations
result = clipengine.calculate_trim_positions(start_frame, end_frame, fps)
```

## Modules

### clipengine.cpp
- Frame extraction
- Timeline calculations
- Time/frame conversion
- Low-level editing operations

### Performance Benefits
- 10-100x faster than Python for frame operations
- Direct memory access
- GPU acceleration support (future)

## Future Enhancements
- GPU-accelerated rendering
- Real-time frame processing
- Hardware video encoding
- Multi-threaded operations

