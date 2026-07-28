"""Speech engines, chunking, audio processing and cache-aware synthesis.

This package deliberately re-exports nothing. ``audio_processor`` is a leaf
utility that the cache layer depends on, while ``synthesis_service`` depends on
the cache; eager re-exports here would make that a circular import. Import the
concrete module you need.
"""
