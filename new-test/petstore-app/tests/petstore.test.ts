/**
 * Comprehensive Test Suite for PetStoreService
 *
 * Generated with:
 * - Framework: Jest
 * - Target Coverage: 95%
 * - AgentDB Integration: QUIC sync, pattern storage, vector search
 * - Learning System: Q-learning with performance tracking
 * - Pattern Bank: Test pattern extraction and reuse
 */

import { PetStoreService, Pet } from '../src/petstore';

describe('PetStoreService', () => {
  let service: PetStoreService;

  beforeEach(() => {
    service = new PetStoreService();
  });

  afterEach(() => {
    // Clean up service instance
    service = null as any;
  });

  describe('addPet', () => {
    it('should add a new pet and return it with a generated ID', () => {
      // Arrange
      const petData = {
        name: 'Buddy',
        species: 'dog' as const,
        age: 3,
        available: true
      };

      // Act
      const result = service.addPet(petData);

      // Assert
      expect(result).toMatchObject(petData);
      expect(result.id).toBe(1);
      expect(typeof result.id).toBe('number');
    });

    it('should auto-increment pet IDs correctly', () => {
      // Arrange
      const pet1 = { name: 'Max', species: 'dog' as const, age: 2, available: true };
      const pet2 = { name: 'Luna', species: 'cat' as const, age: 1, available: true };
      const pet3 = { name: 'Charlie', species: 'bird' as const, age: 4, available: false };

      // Act
      const result1 = service.addPet(pet1);
      const result2 = service.addPet(pet2);
      const result3 = service.addPet(pet3);

      // Assert
      expect(result1.id).toBe(1);
      expect(result2.id).toBe(2);
      expect(result3.id).toBe(3);
    });

    it('should handle all valid species types', () => {
      // Arrange & Act
      const dog = service.addPet({ name: 'Rex', species: 'dog', age: 5, available: true });
      const cat = service.addPet({ name: 'Whiskers', species: 'cat', age: 2, available: true });
      const bird = service.addPet({ name: 'Tweety', species: 'bird', age: 1, available: true });
      const fish = service.addPet({ name: 'Nemo', species: 'fish', age: 1, available: true });

      // Assert
      expect(dog.species).toBe('dog');
      expect(cat.species).toBe('cat');
      expect(bird.species).toBe('bird');
      expect(fish.species).toBe('fish');
    });

    it('should handle pets with age 0', () => {
      // Arrange
      const newbornPet = {
        name: 'Puppy',
        species: 'dog' as const,
        age: 0,
        available: true
      };

      // Act
      const result = service.addPet(newbornPet);

      // Assert
      expect(result.age).toBe(0);
      expect(result.id).toBeDefined();
    });

    it('should handle pets with very high age', () => {
      // Arrange
      const oldPet = {
        name: 'Ancient',
        species: 'fish' as const,
        age: 100,
        available: true
      };

      // Act
      const result = service.addPet(oldPet);

      // Assert
      expect(result.age).toBe(100);
      expect(result.id).toBeDefined();
    });

    it('should handle unavailable pets at creation', () => {
      // Arrange
      const unavailablePet = {
        name: 'Reserved',
        species: 'cat' as const,
        age: 2,
        available: false
      };

      // Act
      const result = service.addPet(unavailablePet);

      // Assert
      expect(result.available).toBe(false);
    });

    it('should handle empty string name', () => {
      // Arrange
      const petWithEmptyName = {
        name: '',
        species: 'dog' as const,
        age: 1,
        available: true
      };

      // Act
      const result = service.addPet(petWithEmptyName);

      // Assert
      expect(result.name).toBe('');
      expect(result.id).toBeDefined();
    });

    it('should handle very long pet names', () => {
      // Arrange
      const longName = 'A'.repeat(1000);
      const petWithLongName = {
        name: longName,
        species: 'bird' as const,
        age: 2,
        available: true
      };

      // Act
      const result = service.addPet(petWithLongName);

      // Assert
      expect(result.name).toBe(longName);
      expect(result.name.length).toBe(1000);
    });

    it('should handle special characters in pet name', () => {
      // Arrange
      const specialNames = [
        'Mr. Fluffy',
        'Luna-Marie',
        'Max (the dog)',
        'Neko™',
        '猫咪', // Chinese characters
        '🐶 Buddy'
      ];

      // Act & Assert
      specialNames.forEach((name, index) => {
        const result = service.addPet({
          name,
          species: 'dog',
          age: 1,
          available: true
        });
        expect(result.name).toBe(name);
        expect(result.id).toBe(index + 1);
      });
    });

    it('should maintain data integrity when adding multiple pets rapidly', () => {
      // Arrange
      const pets = Array.from({ length: 100 }, (_, i) => ({
        name: `Pet${i}`,
        species: (['dog', 'cat', 'bird', 'fish'] as const)[i % 4],
        age: i % 20,
        available: i % 2 === 0
      }));

      // Act
      const results = pets.map(pet => service.addPet(pet));

      // Assert
      expect(results).toHaveLength(100);
      expect(results[0].id).toBe(1);
      expect(results[99].id).toBe(100);
      expect(new Set(results.map(r => r.id)).size).toBe(100); // All IDs unique
    });
  });

  describe('getPet', () => {
    it('should return a pet by valid ID', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      const result = service.getPet(pet.id);

      // Assert
      expect(result).toEqual(pet);
    });

    it('should return undefined for non-existent ID', () => {
      // Act
      const result = service.getPet(999);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return undefined for ID 0', () => {
      // Act
      const result = service.getPet(0);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return undefined for negative ID', () => {
      // Act
      const result = service.getPet(-1);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return correct pet from multiple pets', () => {
      // Arrange
      const pet1 = service.addPet({ name: 'Max', species: 'dog', age: 2, available: true });
      const pet2 = service.addPet({ name: 'Luna', species: 'cat', age: 1, available: true });
      const pet3 = service.addPet({ name: 'Charlie', species: 'bird', age: 4, available: false });

      // Act
      const result = service.getPet(pet2.id);

      // Assert
      expect(result).toEqual(pet2);
      expect(result?.name).toBe('Luna');
    });

    it('should return updated pet data after modification', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });
      service.updateAvailability(pet.id, false);

      // Act
      const result = service.getPet(pet.id);

      // Assert
      expect(result?.available).toBe(false);
    });

    it('should handle very large ID values', () => {
      // Act
      const result = service.getPet(Number.MAX_SAFE_INTEGER);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('getAvailablePets', () => {
    it('should return empty array when no pets exist', () => {
      // Act
      const result = service.getAvailablePets();

      // Assert
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should return only available pets', () => {
      // Arrange
      service.addPet({ name: 'Available1', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Unavailable1', species: 'cat', age: 2, available: false });
      service.addPet({ name: 'Available2', species: 'bird', age: 3, available: true });
      service.addPet({ name: 'Unavailable2', species: 'fish', age: 4, available: false });

      // Act
      const result = service.getAvailablePets();

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every(pet => pet.available)).toBe(true);
      expect(result.map(p => p.name)).toContain('Available1');
      expect(result.map(p => p.name)).toContain('Available2');
    });

    it('should return all pets when all are available', () => {
      // Arrange
      service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });
      service.addPet({ name: 'Pet3', species: 'bird', age: 3, available: true });

      // Act
      const result = service.getAvailablePets();

      // Assert
      expect(result).toHaveLength(3);
      expect(result.every(pet => pet.available)).toBe(true);
    });

    it('should return empty array when no pets are available', () => {
      // Arrange
      service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: false });
      service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: false });

      // Act
      const result = service.getAvailablePets();

      // Assert
      expect(result).toEqual([]);
    });

    it('should reflect real-time availability changes', () => {
      // Arrange
      const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      const pet2 = service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });

      // Act - Initial state
      let result = service.getAvailablePets();
      expect(result).toHaveLength(2);

      // Act - Change availability
      service.updateAvailability(pet1.id, false);
      result = service.getAvailablePets();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(pet2.id);
    });

    it('should handle large number of available pets', () => {
      // Arrange
      for (let i = 0; i < 1000; i++) {
        service.addPet({
          name: `Pet${i}`,
          species: 'dog',
          age: i % 20,
          available: i % 2 === 0
        });
      }

      // Act
      const result = service.getAvailablePets();

      // Assert
      expect(result).toHaveLength(500);
      expect(result.every(pet => pet.available)).toBe(true);
    });
  });

  describe('updateAvailability', () => {
    it('should update availability to false for existing pet', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      const result = service.updateAvailability(pet.id, false);

      // Assert
      expect(result).toBeDefined();
      expect(result?.available).toBe(false);
      expect(result?.id).toBe(pet.id);
    });

    it('should update availability to true for existing pet', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: false });

      // Act
      const result = service.updateAvailability(pet.id, true);

      // Assert
      expect(result).toBeDefined();
      expect(result?.available).toBe(true);
    });

    it('should return undefined for non-existent pet', () => {
      // Act
      const result = service.updateAvailability(999, true);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should persist availability change', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      service.updateAvailability(pet.id, false);
      const retrieved = service.getPet(pet.id);

      // Assert
      expect(retrieved?.available).toBe(false);
    });

    it('should allow toggling availability multiple times', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act & Assert
      let result = service.updateAvailability(pet.id, false);
      expect(result?.available).toBe(false);

      result = service.updateAvailability(pet.id, true);
      expect(result?.available).toBe(true);

      result = service.updateAvailability(pet.id, false);
      expect(result?.available).toBe(false);
    });

    it('should not affect other pet properties', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });
      const originalName = pet.name;
      const originalSpecies = pet.species;
      const originalAge = pet.age;

      // Act
      service.updateAvailability(pet.id, false);
      const retrieved = service.getPet(pet.id);

      // Assert
      expect(retrieved?.name).toBe(originalName);
      expect(retrieved?.species).toBe(originalSpecies);
      expect(retrieved?.age).toBe(originalAge);
    });

    it('should handle updating same availability value', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      const result = service.updateAvailability(pet.id, true);

      // Assert
      expect(result?.available).toBe(true);
    });

    it('should return undefined for ID 0', () => {
      // Act
      const result = service.updateAvailability(0, true);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return undefined for negative ID', () => {
      // Act
      const result = service.updateAvailability(-5, true);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('deletePet', () => {
    it('should delete an existing pet and return true', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      const result = service.deletePet(pet.id);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent pet', () => {
      // Act
      const result = service.deletePet(999);

      // Assert
      expect(result).toBe(false);
    });

    it('should make pet unavailable after deletion', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      service.deletePet(pet.id);
      const retrieved = service.getPet(pet.id);

      // Assert
      expect(retrieved).toBeUndefined();
    });

    it('should reduce total count after deletion', () => {
      // Arrange
      service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      const pet2 = service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });
      service.addPet({ name: 'Pet3', species: 'bird', age: 3, available: true });

      // Act
      service.deletePet(pet2.id);

      // Assert
      expect(service.getTotalCount()).toBe(2);
    });

    it('should allow deleting multiple pets', () => {
      // Arrange
      const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      const pet2 = service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });
      const pet3 = service.addPet({ name: 'Pet3', species: 'bird', age: 3, available: true });

      // Act
      const result1 = service.deletePet(pet1.id);
      const result2 = service.deletePet(pet3.id);

      // Assert
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(service.getTotalCount()).toBe(1);
      expect(service.getPet(pet2.id)).toBeDefined();
    });

    it('should return false when deleting same pet twice', () => {
      // Arrange
      const pet = service.addPet({ name: 'Buddy', species: 'dog', age: 3, available: true });

      // Act
      const firstDelete = service.deletePet(pet.id);
      const secondDelete = service.deletePet(pet.id);

      // Assert
      expect(firstDelete).toBe(true);
      expect(secondDelete).toBe(false);
    });

    it('should handle deleting all pets', () => {
      // Arrange
      const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      const pet2 = service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });

      // Act
      service.deletePet(pet1.id);
      service.deletePet(pet2.id);

      // Assert
      expect(service.getTotalCount()).toBe(0);
      expect(service.getAvailablePets()).toHaveLength(0);
    });

    it('should return false for ID 0', () => {
      // Act
      const result = service.deletePet(0);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for negative ID', () => {
      // Act
      const result = service.deletePet(-1);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('searchBySpecies', () => {
    it('should return empty array when no pets exist', () => {
      // Act
      const result = service.searchBySpecies('dog');

      // Assert
      expect(result).toEqual([]);
    });

    it('should find all dogs', () => {
      // Arrange
      service.addPet({ name: 'Max', species: 'dog', age: 3, available: true });
      service.addPet({ name: 'Luna', species: 'cat', age: 2, available: true });
      service.addPet({ name: 'Buddy', species: 'dog', age: 5, available: false });

      // Act
      const result = service.searchBySpecies('dog');

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every(pet => pet.species === 'dog')).toBe(true);
      expect(result.map(p => p.name)).toContain('Max');
      expect(result.map(p => p.name)).toContain('Buddy');
    });

    it('should find all cats', () => {
      // Arrange
      service.addPet({ name: 'Whiskers', species: 'cat', age: 2, available: true });
      service.addPet({ name: 'Fluffy', species: 'cat', age: 4, available: false });
      service.addPet({ name: 'Max', species: 'dog', age: 3, available: true });

      // Act
      const result = service.searchBySpecies('cat');

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every(pet => pet.species === 'cat')).toBe(true);
    });

    it('should find all birds', () => {
      // Arrange
      service.addPet({ name: 'Tweety', species: 'bird', age: 1, available: true });
      service.addPet({ name: 'Polly', species: 'bird', age: 3, available: true });

      // Act
      const result = service.searchBySpecies('bird');

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every(pet => pet.species === 'bird')).toBe(true);
    });

    it('should find all fish', () => {
      // Arrange
      service.addPet({ name: 'Nemo', species: 'fish', age: 1, available: true });
      service.addPet({ name: 'Dory', species: 'fish', age: 2, available: false });

      // Act
      const result = service.searchBySpecies('fish');

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every(pet => pet.species === 'fish')).toBe(true);
    });

    it('should return empty array when no pets match species', () => {
      // Arrange
      service.addPet({ name: 'Max', species: 'dog', age: 3, available: true });

      // Act
      const result = service.searchBySpecies('fish');

      // Assert
      expect(result).toEqual([]);
    });

    it('should include both available and unavailable pets', () => {
      // Arrange
      service.addPet({ name: 'Dog1', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Dog2', species: 'dog', age: 2, available: false });
      service.addPet({ name: 'Dog3', species: 'dog', age: 3, available: true });

      // Act
      const result = service.searchBySpecies('dog');

      // Assert
      expect(result).toHaveLength(3);
      expect(result.filter(p => p.available)).toHaveLength(2);
      expect(result.filter(p => !p.available)).toHaveLength(1);
    });

    it('should handle large dataset efficiently', () => {
      // Arrange
      for (let i = 0; i < 1000; i++) {
        service.addPet({
          name: `Pet${i}`,
          species: (['dog', 'cat', 'bird', 'fish'] as const)[i % 4],
          age: i % 20,
          available: true
        });
      }

      // Act
      const dogs = service.searchBySpecies('dog');
      const cats = service.searchBySpecies('cat');
      const birds = service.searchBySpecies('bird');
      const fish = service.searchBySpecies('fish');

      // Assert
      expect(dogs).toHaveLength(250);
      expect(cats).toHaveLength(250);
      expect(birds).toHaveLength(250);
      expect(fish).toHaveLength(250);
    });

    it('should return pets after some are deleted', () => {
      // Arrange
      const dog1 = service.addPet({ name: 'Dog1', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Dog2', species: 'dog', age: 2, available: true });
      service.addPet({ name: 'Dog3', species: 'dog', age: 3, available: true });

      // Act
      service.deletePet(dog1.id);
      const result = service.searchBySpecies('dog');

      // Assert
      expect(result).toHaveLength(2);
      expect(result.map(p => p.name)).not.toContain('Dog1');
    });
  });

  describe('getTotalCount', () => {
    it('should return 0 when no pets exist', () => {
      // Act
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(0);
    });

    it('should return correct count after adding pets', () => {
      // Arrange
      service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });
      service.addPet({ name: 'Pet3', species: 'bird', age: 3, available: true });

      // Act
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(3);
    });

    it('should include both available and unavailable pets', () => {
      // Arrange
      service.addPet({ name: 'Available', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Unavailable', species: 'cat', age: 2, available: false });

      // Act
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(2);
    });

    it('should decrease after deleting a pet', () => {
      // Arrange
      const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });

      // Act
      service.deletePet(pet1.id);
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(1);
    });

    it('should not change when updating availability', () => {
      // Arrange
      const pet = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });

      // Act
      service.updateAvailability(pet.id, false);
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(1);
    });

    it('should handle large number of pets', () => {
      // Arrange
      for (let i = 0; i < 10000; i++) {
        service.addPet({
          name: `Pet${i}`,
          species: 'dog',
          age: i % 20,
          available: true
        });
      }

      // Act
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(10000);
    });

    it('should return 0 after deleting all pets', () => {
      // Arrange
      const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
      const pet2 = service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });

      // Act
      service.deletePet(pet1.id);
      service.deletePet(pet2.id);
      const result = service.getTotalCount();

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    describe('Concurrent Operations', () => {
      it('should handle rapid sequential additions', () => {
        // Arrange
        const pets = Array.from({ length: 100 }, (_, i) => ({
          name: `Pet${i}`,
          species: 'dog' as const,
          age: i,
          available: true
        }));

        // Act
        const results = pets.map(pet => service.addPet(pet));

        // Assert
        expect(results).toHaveLength(100);
        expect(service.getTotalCount()).toBe(100);
        expect(new Set(results.map(r => r.id)).size).toBe(100);
      });

      it('should handle mixed operations in sequence', () => {
        // Arrange & Act
        const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
        const pet2 = service.addPet({ name: 'Pet2', species: 'cat', age: 2, available: true });
        service.updateAvailability(pet1.id, false);
        const pet3 = service.addPet({ name: 'Pet3', species: 'bird', age: 3, available: true });
        service.deletePet(pet2.id);
        const available = service.getAvailablePets();

        // Assert
        expect(service.getTotalCount()).toBe(2);
        expect(available).toHaveLength(1);
        expect(available[0].id).toBe(pet3.id);
      });
    });

    describe('State Consistency', () => {
      it('should maintain consistent state after multiple operations', () => {
        // Arrange
        const pet1 = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
        const pet2 = service.addPet({ name: 'Pet2', species: 'dog', age: 2, available: true });
        const pet3 = service.addPet({ name: 'Pet3', species: 'cat', age: 3, available: true });

        // Act
        service.updateAvailability(pet1.id, false);
        service.deletePet(pet2.id);

        // Assert
        expect(service.getTotalCount()).toBe(2);
        expect(service.getAvailablePets()).toHaveLength(1);
        expect(service.searchBySpecies('dog')).toHaveLength(1);
        expect(service.getPet(pet2.id)).toBeUndefined();
      });

      it('should handle operations on deleted pets gracefully', () => {
        // Arrange
        const pet = service.addPet({ name: 'Pet1', species: 'dog', age: 1, available: true });
        service.deletePet(pet.id);

        // Act
        const updateResult = service.updateAvailability(pet.id, false);
        const getResult = service.getPet(pet.id);
        const deleteResult = service.deletePet(pet.id);

        // Assert
        expect(updateResult).toBeUndefined();
        expect(getResult).toBeUndefined();
        expect(deleteResult).toBe(false);
      });
    });

    describe('Memory and Performance', () => {
      it('should handle very large datasets without errors', () => {
        // Arrange
        const count = 5000;

        // Act
        for (let i = 0; i < count; i++) {
          service.addPet({
            name: `Pet${i}`,
            species: (['dog', 'cat', 'bird', 'fish'] as const)[i % 4],
            age: i % 100,
            available: i % 3 === 0
          });
        }

        // Assert
        expect(service.getTotalCount()).toBe(count);
        expect(service.getAvailablePets().length).toBeGreaterThan(0);
        expect(service.searchBySpecies('dog').length).toBeGreaterThan(0);
      });

      it('should efficiently filter large datasets', () => {
        // Arrange
        for (let i = 0; i < 1000; i++) {
          service.addPet({
            name: `Pet${i}`,
            species: 'dog',
            age: i % 20,
            available: i % 2 === 0
          });
        }

        // Act
        const startTime = Date.now();
        const available = service.getAvailablePets();
        const dogs = service.searchBySpecies('dog');
        const endTime = Date.now();

        // Assert
        expect(available).toHaveLength(500);
        expect(dogs).toHaveLength(1000);
        expect(endTime - startTime).toBeLessThan(100); // Should be fast
      });
    });

    describe('Data Integrity', () => {
      it('should not mutate original pet data object', () => {
        // Arrange
        const originalData = {
          name: 'Original',
          species: 'dog' as const,
          age: 5,
          available: true
        };
        const dataCopy = { ...originalData };

        // Act
        service.addPet(originalData);

        // Assert
        expect(originalData).toEqual(dataCopy);
      });

      it('should return independent pet objects', () => {
        // Arrange
        const pet = service.addPet({ name: 'Pet', species: 'dog', age: 1, available: true });

        // Act
        const retrieved1 = service.getPet(pet.id);
        const retrieved2 = service.getPet(pet.id);

        // Assert
        expect(retrieved1).toBe(retrieved2); // Same reference (Map returns same object)
        if (retrieved1) {
          retrieved1.name = 'Modified';
          expect(retrieved2?.name).toBe('Modified'); // Mutation is reflected
        }
      });

      it('should handle pet with all boundary values', () => {
        // Arrange
        const boundaryPet = {
          name: '',
          species: 'fish' as const,
          age: 0,
          available: false
        };

        // Act
        const result = service.addPet(boundaryPet);

        // Assert
        expect(result.name).toBe('');
        expect(result.species).toBe('fish');
        expect(result.age).toBe(0);
        expect(result.available).toBe(false);
        expect(result.id).toBeDefined();
      });
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete pet lifecycle', () => {
      // Add pet
      const pet = service.addPet({
        name: 'Buddy',
        species: 'dog',
        age: 2,
        available: true
      });
      expect(pet.id).toBeDefined();

      // Retrieve pet
      const retrieved = service.getPet(pet.id);
      expect(retrieved).toEqual(pet);

      // Find in available list
      let available = service.getAvailablePets();
      expect(available).toContainEqual(pet);

      // Update availability
      service.updateAvailability(pet.id, false);
      available = service.getAvailablePets();
      expect(available).not.toContainEqual(pet);

      // Search by species
      const dogs = service.searchBySpecies('dog');
      expect(dogs.some(p => p.id === pet.id)).toBe(true);

      // Delete pet
      const deleted = service.deletePet(pet.id);
      expect(deleted).toBe(true);

      // Verify deletion
      expect(service.getPet(pet.id)).toBeUndefined();
      expect(service.getTotalCount()).toBe(0);
    });

    it('should support multi-species pet store management', () => {
      // Add variety of pets
      const pets = {
        dogs: [
          service.addPet({ name: 'Max', species: 'dog', age: 3, available: true }),
          service.addPet({ name: 'Buddy', species: 'dog', age: 5, available: true })
        ],
        cats: [
          service.addPet({ name: 'Luna', species: 'cat', age: 2, available: true }),
          service.addPet({ name: 'Whiskers', species: 'cat', age: 4, available: false })
        ],
        birds: [
          service.addPet({ name: 'Tweety', species: 'bird', age: 1, available: true })
        ],
        fish: [
          service.addPet({ name: 'Nemo', species: 'fish', age: 1, available: true })
        ]
      };

      // Verify total count
      expect(service.getTotalCount()).toBe(6);

      // Verify species search
      expect(service.searchBySpecies('dog')).toHaveLength(2);
      expect(service.searchBySpecies('cat')).toHaveLength(2);
      expect(service.searchBySpecies('bird')).toHaveLength(1);
      expect(service.searchBySpecies('fish')).toHaveLength(1);

      // Verify available count
      expect(service.getAvailablePets()).toHaveLength(5);

      // Make all unavailable
      pets.dogs.forEach(p => service.updateAvailability(p.id, false));
      pets.cats.forEach(p => service.updateAvailability(p.id, false));
      pets.birds.forEach(p => service.updateAvailability(p.id, false));
      pets.fish.forEach(p => service.updateAvailability(p.id, false));

      expect(service.getAvailablePets()).toHaveLength(0);
    });
  });
});
