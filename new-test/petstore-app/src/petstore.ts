// Simple Petstore API Service
export interface Pet {
  id: number;
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'fish';
  age: number;
  available: boolean;
}

export class PetStoreService {
  private pets: Map<number, Pet> = new Map();
  private nextId = 1;

  /**
   * Add a new pet to the store
   */
  addPet(pet: Omit<Pet, 'id'>): Pet {
    const newPet: Pet = {
      ...pet,
      id: this.nextId++
    };
    this.pets.set(newPet.id, newPet);
    return newPet;
  }

  /**
   * Get a pet by ID
   */
  getPet(id: number): Pet | undefined {
    return this.pets.get(id);
  }

  /**
   * Get all available pets
   */
  getAvailablePets(): Pet[] {
    return Array.from(this.pets.values()).filter(pet => pet.available);
  }

  /**
   * Update pet availability
   */
  updateAvailability(id: number, available: boolean): Pet | undefined {
    const pet = this.pets.get(id);
    if (pet) {
      pet.available = available;
      return pet;
    }
    return undefined;
  }

  /**
   * Delete a pet
   */
  deletePet(id: number): boolean {
    return this.pets.delete(id);
  }

  /**
   * Search pets by species
   */
  searchBySpecies(species: Pet['species']): Pet[] {
    return Array.from(this.pets.values()).filter(pet => pet.species === species);
  }

  /**
   * Get total count of pets
   */
  getTotalCount(): number {
    return this.pets.size;
  }
}
