import Foundation

public protocol UserServiceProtocol {
    func getUser(id: String) async throws -> User?
    func getAllUsers() async -> [User]
    func createUser(name: String, email: String) async throws -> User
}

public struct User {
    let id: String
    let name: String
    let email: String
}

@Observable
public class UserService: UserServiceProtocol {
    private let repository: UserRepository

    public init(repository: UserRepository) {
        self.repository = repository
    }

    public func getUser(id: String) async throws -> User? {
        guard !id.isEmpty else {
            throw ServiceError.invalidId
        }
        return try await repository.findById(id)
    }

    public func getAllUsers() async -> [User] {
        return await repository.findAll()
    }

    public func createUser(name: String, email: String) async throws -> User {
        guard !name.isEmpty else {
            throw ServiceError.validationFailed("Name is required")
        }
        return try await repository.save(User(id: UUID().uuidString, name: name, email: email))
    }

    public func deleteUser(id: String) async throws {
        try await repository.delete(id)
    }

    public func isActive(user: User) -> Bool {
        return !user.id.isEmpty
    }
}

public enum ServiceError: Error {
    case invalidId
    case validationFailed(String)
    case notFound
}
