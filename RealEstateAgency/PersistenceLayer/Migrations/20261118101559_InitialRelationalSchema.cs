using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RealEstateAgency.PersistenceLayer.Migrations
{
    /// <inheritdoc />
    public partial class InitialRelationalSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "agency_revision",
                columns: table => new
                {
                    id = table.Column<int>(type: "INTEGER", nullable: false),
                    version = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agency_revision", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "agents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    name = table.Column<string>(type: "TEXT", nullable: false),
                    experienceYears = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_agents", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "clients",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    agentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    name = table.Column<string>(type: "TEXT", nullable: false),
                    contactInfo = table.Column<string>(type: "TEXT", nullable: false),
                    type = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_clients", x => x.id);
                    table.ForeignKey(
                        name: "FK_clients_agents_agentId",
                        column: x => x.agentId,
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "properties",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    agentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    type = table.Column<string>(type: "TEXT", nullable: false),
                    area = table.Column<double>(type: "REAL", nullable: false),
                    address = table.Column<string>(type: "TEXT", nullable: false),
                    district = table.Column<string>(type: "TEXT", nullable: false),
                    landmark = table.Column<string>(type: "TEXT", nullable: false),
                    rooms = table.Column<int>(type: "INTEGER", nullable: false),
                    yearBuilt = table.Column<int>(type: "INTEGER", nullable: false),
                    price = table.Column<decimal>(type: "TEXT", nullable: false),
                    status = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_properties", x => x.id);
                    table.ForeignKey(
                        name: "FK_properties_agents_agentId",
                        column: x => x.agentId,
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "client_notifications",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    clientId = table.Column<Guid>(type: "TEXT", nullable: false),
                    message = table.Column<string>(type: "TEXT", nullable: false),
                    createdAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    position = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_notifications", x => x.id);
                    table.ForeignKey(
                        name: "FK_client_notifications_clients_clientId",
                        column: x => x.clientId,
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "client_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    clientId = table.Column<Guid>(type: "TEXT", nullable: false),
                    title = table.Column<string>(type: "TEXT", nullable: false),
                    filter = table.Column<string>(type: "TEXT", nullable: false),
                    createdAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    isActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_client_requests_clients_clientId",
                        column: x => x.clientId,
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "saved_searches",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    clientId = table.Column<Guid>(type: "TEXT", nullable: false),
                    createdAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    title = table.Column<string>(type: "TEXT", nullable: false),
                    filter = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_saved_searches", x => x.id);
                    table.ForeignKey(
                        name: "FK_saved_searches_clients_clientId",
                        column: x => x.clientId,
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "search_history",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    clientId = table.Column<Guid>(type: "TEXT", nullable: false),
                    createdAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    filter = table.Column<string>(type: "TEXT", nullable: false),
                    resultCount = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_search_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_search_history_clients_clientId",
                        column: x => x.clientId,
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_profiles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    email = table.Column<string>(type: "TEXT", nullable: false),
                    displayName = table.Column<string>(type: "TEXT", nullable: false),
                    role = table.Column<string>(type: "TEXT", nullable: false),
                    agentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    clientId = table.Column<Guid>(type: "TEXT", nullable: true),
                    createdAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_profiles", x => x.id);
                    table.ForeignKey(
                        name: "FK_user_profiles_agents_agentId",
                        column: x => x.agentId,
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_profiles_clients_clientId",
                        column: x => x.clientId,
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "deals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    date = table.Column<DateTime>(type: "TEXT", nullable: false),
                    propertyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    agentId = table.Column<Guid>(type: "TEXT", nullable: false),
                    clientId = table.Column<Guid>(type: "TEXT", nullable: false),
                    totalCost = table.Column<decimal>(type: "TEXT", nullable: false),
                    type = table.Column<int>(type: "INTEGER", nullable: false),
                    commissionPercent = table.Column<decimal>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deals", x => x.id);
                    table.ForeignKey(
                        name: "FK_deals_agents_agentId",
                        column: x => x.agentId,
                        principalTable: "agents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_deals_clients_clientId",
                        column: x => x.clientId,
                        principalTable: "clients",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_deals_properties_propertyId",
                        column: x => x.propertyId,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "property_price_history",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    propertyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    position = table.Column<int>(type: "INTEGER", nullable: false),
                    changedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    oldPrice = table.Column<decimal>(type: "TEXT", nullable: false),
                    newPrice = table.Column<decimal>(type: "TEXT", nullable: false),
                    comment = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_property_price_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_property_price_history_properties_propertyId",
                        column: x => x.propertyId,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "property_status_history",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    propertyId = table.Column<Guid>(type: "TEXT", nullable: false),
                    position = table.Column<int>(type: "INTEGER", nullable: false),
                    changedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    oldStatus = table.Column<int>(type: "INTEGER", nullable: false),
                    newStatus = table.Column<int>(type: "INTEGER", nullable: false),
                    comment = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_property_status_history", x => x.id);
                    table.ForeignKey(
                        name: "FK_property_status_history_properties_propertyId",
                        column: x => x.propertyId,
                        principalTable: "properties",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "agency_revision",
                columns: new[] { "id", "version" },
                values: new object[] { 1, 0L });

            migrationBuilder.CreateIndex(
                name: "IX_client_notifications_clientId",
                table: "client_notifications",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_client_requests_clientId",
                table: "client_requests",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_clients_agentId",
                table: "clients",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_deals_agentId",
                table: "deals",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_deals_clientId",
                table: "deals",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_deals_propertyId",
                table: "deals",
                column: "propertyId");

            migrationBuilder.CreateIndex(
                name: "IX_properties_agentId",
                table: "properties",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_property_price_history_propertyId",
                table: "property_price_history",
                column: "propertyId");

            migrationBuilder.CreateIndex(
                name: "IX_property_status_history_propertyId",
                table: "property_status_history",
                column: "propertyId");

            migrationBuilder.CreateIndex(
                name: "IX_saved_searches_clientId",
                table: "saved_searches",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_search_history_clientId",
                table: "search_history",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_user_profiles_agentId",
                table: "user_profiles",
                column: "agentId");

            migrationBuilder.CreateIndex(
                name: "IX_user_profiles_clientId",
                table: "user_profiles",
                column: "clientId");

            migrationBuilder.CreateIndex(
                name: "IX_user_profiles_email",
                table: "user_profiles",
                column: "email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "agency_revision");

            migrationBuilder.DropTable(
                name: "client_notifications");

            migrationBuilder.DropTable(
                name: "client_requests");

            migrationBuilder.DropTable(
                name: "deals");

            migrationBuilder.DropTable(
                name: "property_price_history");

            migrationBuilder.DropTable(
                name: "property_status_history");

            migrationBuilder.DropTable(
                name: "saved_searches");

            migrationBuilder.DropTable(
                name: "search_history");

            migrationBuilder.DropTable(
                name: "user_profiles");

            migrationBuilder.DropTable(
                name: "properties");

            migrationBuilder.DropTable(
                name: "clients");

            migrationBuilder.DropTable(
                name: "agents");
        }
    }
}
